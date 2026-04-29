import {FlyToInterpolator, LinearInterpolator, TRANSITION_EVENTS} from '@deck.gl/core'
import {isNil} from 'lodash/fp'
import {OrthographicViewport} from '../view/deck/OrthographicViewport'
import {Box, Coordinates, Dimensions, getPolygonBearing, Range, RowCoordinates} from '@hopara/spatial'
import {World} from '../world/World'
import {ZoomRange} from '../zoom/ZoomRange'
import OrbitViewport from '../view/deck/OrbitViewport'
import {DEFAULT_ORBIT_AXIS} from '../view/3d/3DViewComponent'
import {AxesDimensions} from '../chart/domain/AxesDimension'
import WebMercatorViewport from '../view/deck/WebMercatorViewport'
import {Padding} from '@deck.gl/core/typed/viewports/viewport'
import {VisualizationType} from '../visualization/Visualization'
import {getBoundsPadding} from '../zoom/translate/BoundsPadding'

export const DEFAULT_TRANSITION_ORBIT_DURATION = 1000
export const DEFAULT_TRANSITION_ORBIT_STEP_SIZE = 30

const GEO_WORLD_BOX = new Box({
  x: new Range({min: -180, max: 180}),
  y: new Range({min: -90, max: 90}),
})

export const getCenterOfTheWorldCoordinates = (
  world: World,
  dimensions?: Dimensions,
  axesDimensions?: AxesDimensions): Coordinates | undefined => {
  if (world.isOrbitCamera() || world.isWebmercatorProjection()) return new Coordinates()
  if (!dimensions) return

  return new Coordinates({
    x: (dimensions.width / 2) - (axesDimensions?.y?.width ?? 0),
    y: (dimensions.height / 2) - (axesDimensions?.x?.height ?? 0),
  })
}

export enum ZoomBehaviorType {
  FIXED = 'FIXED',
  SCALE = 'SCALE',
}

export type ZoomBehavior = {
  x: ZoomBehaviorType
  y: ZoomBehaviorType
}

export enum PositionType {
  FIXED = 'FIXED',
  FIT_TO_CONTENT = 'FIT_TO_CONTENT'
}

export class Position {
  type?: PositionType
  x?: number
  y?: number
  z?: number
  zoom?: number
  bearing?: number
  rotationX?: number
  rotationOrbit?: number
  layerId?: string
  padding?: number

  constructor(props?: Partial<Position>) {
    Object.assign(this, props)
  }

  getCoordinates(): Coordinates | undefined {
    if (isNil(this.x) && isNil(this.y)) return undefined
    return new Coordinates({x: this.x, y: this.y, z: this.z})
  }
}

interface ViewStateConstructor extends Partial<ViewState> {
  coordinates?: Coordinates
  dimensions?: Dimensions
}

class ViewState {
  visualizationId: string
  visualizationType: VisualizationType
  private coordinates?: Coordinates
  center?: Coordinates
  zoom: number
  zoomRange: ZoomRange
  bearing: number
  initialPosition: Position
  _lastModified: number
  transitioning?: boolean
  transitionDuration?: number
  lastTransitionTime?: number
  preventTransitionInterruption?: boolean
  zoomBehavior: ZoomBehavior
  rotationOrbit?: number
  rotationX?: number
  dimensions: Dimensions
  viewport: OrbitViewport | WebMercatorViewport | OrthographicViewport
  zoomBackPosition?: Position
  autoRotate?: boolean
  autoNavigate?: boolean
  contentBox?: Box

  // Assigns all attributes from the incoming parameter to this object
  constructor(props?: ViewStateConstructor) {
    Object.assign(this, props)

    if (isNil(this.bearing)) this.bearing = 0
    if (isNil(this.dimensions)) this.dimensions = {width: 0, height: 0}
    if (!this.dimensions.width) this.dimensions.width = 1
    if (!this.dimensions.height) this.dimensions.height = 1
    if (this.initialPosition) this.initialPosition = new Position(this.initialPosition)
    if (this.zoomBackPosition) this.zoomBackPosition = new Position(this.zoomBackPosition)

    if (!this.zoomRange || (isNil(this.zoomRange.getMin()) && isNil(this.zoomRange.getMax()))) {
      this.zoomRange = new ZoomRange({min: {value: 0}, max: {value: 20}})
    }

    this.zoom = this.getTargetZoom(this.zoom)
  }

  getCoordinates(): Coordinates {
    return this.coordinates ?? new Coordinates()
  }

  getRawCoordinates(): Coordinates | undefined {
    return this.coordinates
  }


  getCoordinateState(): { x: number, y: number, longitude?: number, latitude?: number, target: number[] } {
    const coordinates = !this.coordinates ? (this.initialPosition?.getCoordinates() ?? this.center ?? new Coordinates()) : this.coordinates
    return {
      x: coordinates.x,
      y: coordinates.y,
      longitude: this.visualizationType === VisualizationType.GEO ? coordinates.x : undefined,
      latitude: this.visualizationType === VisualizationType.GEO ? coordinates.y : undefined,
      target: coordinates.toArray(),
    }
  }

  getDeckViewState(overrides?: any): any {
    return {
      pitch: 0,
      bearing: this.bearing,
      zoom: this.zoom,
      minZoom: this.getMinZoom(),
      maxZoom: this.getMaxZoom(),
      height: this.getDimensions()?.height,
      width: this.getDimensions()?.width,
      rotationOrbit: this.rotationOrbit ?? 0,
      rotationX: this.rotationX,
      orbitAxis: this.isOrbitViewport(this.viewport) ? DEFAULT_ORBIT_AXIS : undefined,
      ...this.getCoordinateState(),
      ...this.getTransitionProps(),
      ...overrides,
    }
  }

  clone(overrides?: ViewStateConstructor): ViewState {
    const cloned = new ViewState({
      ...this,
      transitioning: false,
      transitionDuration: undefined,
      _lastModified: Date.now(),
      preventTransitionInterruption: false,
      ...overrides,
      coordinates: overrides?.coordinates ?? this.coordinates,
    })

    if (!overrides?.viewport) cloned.viewport = this.createViewport(cloned.getDeckViewState())!

    return cloned
  }

  getInterpolator(): any {
    if (this.isWebMercatorViewport(this.viewport)) {
      return new FlyToInterpolator()
    } else {
      const modifiers = ['target', 'zoom']
      if (!isNil(this.rotationOrbit)) modifiers.push('rotationOrbit')
      return new LinearInterpolator(modifiers)
    }
  }

  getTransitionDuration(): number {
    return this.transitionDuration || 1500
  }

  getTransitionProps() {
    if (!this.transitioning) return {}

    return {
      transitionInterpolator: this.getInterpolator(),
      transitionDuration: this.getTransitionDuration(),
      transitionInterruption: this.preventTransitionInterruption ? TRANSITION_EVENTS.IGNORE : undefined,
    }
  }

  transition(position: Position, preventTransitionInterruption = true): ViewState {
    return this.clone({
      zoom: position.zoom ?? this.zoom,
      bearing: position.bearing ?? this.bearing,
      coordinates: position.getCoordinates(),
      rotationOrbit: position.rotationOrbit,
      rotationX: position.rotationX,
      transitioning: true,
      preventTransitionInterruption: !!preventTransitionInterruption,
    })
  }

  transitionViewCube(rotationX: number, rotationY: number): ViewState {
    return this.clone({
      rotationX,
      rotationOrbit: rotationY,
      transitioning: true,
      transitionDuration: 1,
      lastTransitionTime: Date.now(),
    })
  }

  transitionRotate(rotation: number, interval: number): ViewState {
    return this.clone({
      rotationOrbit: rotation,
      transitioning: true,
      transitionDuration: interval,
      lastTransitionTime: Date.now(),
    })
  }

  getTargetZoom(zoom = 0): number {
    return Math.max(
      this.getMinZoom(),
      Math.min(
        this.getMaxZoom(),
        zoom,
      ),
    )
  }

  zoomTransition(zoom: number): ViewState {
    return this.clone({
      zoom: this.getTargetZoom(zoom),
      transitioning: true,
    })
  }

  addZoom(zoomStep: number) {
    return this.zoomTransition(this.zoom + zoomStep)
  }

  getOrtographicViewPortProps(deckViewState?: any): any {
    return {
      ...deckViewState,
      flipY: false,
      fixedX: this.zoomBehavior.x === ZoomBehaviorType.FIXED,
      fixedY: this.zoomBehavior.y === ZoomBehaviorType.FIXED,
      translationMatrix: [0, 0, 0],
      centerCoordinates: this.center,
      height: this.getDimensions()?.height,
      width: this.getDimensions()?.width,
    }
  }

  createViewport(deckViewState?: any): OrbitViewport | WebMercatorViewport | OrthographicViewport | undefined {
    if (!this.viewport) {
      return undefined
    }

    const deckState = this.getDeckViewState(deckViewState)
    return new this.viewport.ViewportType({
      ...this.viewport,
      pitch: deckState.pitch,
      bearing: deckState.bearing,
      zoom: deckState.zoom,
      target: deckState.target,
      longitude: deckState.longitude,
      latitude: deckState.latitude,
    } as any)
  }

  getViewport(deckViewState?: any): OrbitViewport | WebMercatorViewport | OrthographicViewport | undefined {
    if (deckViewState) {
      return this.createViewport(deckViewState)
    }

    return this.viewport
  }

  isWebMercatorViewport(viewport): viewport is WebMercatorViewport {
    return viewport instanceof WebMercatorViewport
  }

  isOrthographicViewport(viewport): viewport is OrthographicViewport {
    return viewport instanceof OrthographicViewport
  }

  isOrbitViewport(viewport): viewport is OrbitViewport {
    return viewport instanceof OrbitViewport
  }

  getVisibleWorldDimensions(): Dimensions | undefined {
    return this.getViewport()?.getVisibleWorldDimensions()
  }

  getVisibleWorld(): Box | undefined {
    return this.getViewport()?.getVisibleWorld()
  }

  hasDefaultDimensions() {
    return this.dimensions.width === 1 && this.dimensions.height === 1
  }

  private unprojectCoordinateWithTargetPosition(coordinates: Coordinates, targetZoom?: number, targetCoordinates?: [number, number, number?]) {
    const viewport = this.getViewport()
    if (!targetCoordinates) return viewport!.unproject(coordinates.to2DArray())

    const deckViewState = this.getDeckViewState({
      zoom: targetZoom ?? this.zoom,
      target: [targetCoordinates[0], targetCoordinates[1], targetCoordinates[2] ?? this.coordinates?.z ?? 0],
      x: targetCoordinates[0],
      y: targetCoordinates[1],
      longitude: this.isWebMercatorViewport(this.viewport) ? targetCoordinates[0] : undefined,
      latitude: this.isWebMercatorViewport(this.viewport) ? targetCoordinates[1] : undefined,
    })

    const updatedViewport = this.createViewport(deckViewState)
    return updatedViewport!.unproject(coordinates.to2DArray(), {invertAxis: this.isOrbitViewport(this.viewport)} as any) as [number, number, number?]
  }

  unprojectCoordinate(coordinates: Coordinates, targetZoom?: number, targetCoordinates?: [number, number, number?]): [number, number, number?] {
    if (!isNil(targetZoom) || !isNil(targetCoordinates)) {
      return this.unprojectCoordinateWithTargetPosition(coordinates, targetZoom, targetCoordinates) as [number, number, number?]
    }

    const viewport = this.getViewport(this.getDeckViewState())
    return viewport!.unproject(coordinates.to2DArray(), {invertAxis: this.isOrbitViewport(this.viewport)} as any) as [number, number, number?]
  }

  projectCoordinate(coordinates: Coordinates): number[] {
    return this.getViewport()!.project(coordinates.to2DArray())
  }

  getMaxZoom(): number {
    return this.zoomRange.getMax() - 0.01 // stop before max
  }

  getMinZoom(): number {
    return this.zoomRange.getMin()
  }

  withDeckViewState(deckViewState: any): ViewState {
    let coordinates: Coordinates | undefined

    if (this.isWebMercatorViewport(this.viewport)) {
      coordinates = new Coordinates({
        x: deckViewState.longitude,
        y: deckViewState.latitude,
        z: this.coordinates?.z ?? 0
      })
    } else if (deckViewState?.target?.length === 3) {
      coordinates = Coordinates.fromArray([...deckViewState.target])
    } else if (deckViewState?.target?.length === 2) {
      coordinates = Coordinates.fromArray([...deckViewState.target, this.coordinates?.z ?? 0])
    }

    return this.clone({
      coordinates,
      rotationOrbit: deckViewState.rotationOrbit,
      rotationX: deckViewState.rotationX,
      bearing: deckViewState.bearing,
      zoom: deckViewState.zoom,
    })
  }

  isNewerThan(viewState?: ViewState): boolean {
    if (!viewState) return true
    return this._lastModified > viewState._lastModified
  }

  getFitBoundsZoom(bounds: [[number, number], [number, number]], padding: number | Required<Padding> = 0, bearing?: number): number | undefined {
    const viewport = this.getViewport(!isNil(bearing) ? {bearing} : undefined)
    if (!viewport) return

    return Number(viewport.fitBounds(bounds, { maxZoom: this.zoomRange.getMaxVisible(), padding })
                          .zoom.toFixed(2))
  }

  setInitialPosition(position?: Partial<Position>): ViewState {
    return this.clone({initialPosition: position ? new Position(position) : undefined})
  }

  setZoomRange(zoomRange?: ZoomRange): ViewState {
    return this.clone({zoomRange: zoomRange ? new ZoomRange(zoomRange) : undefined})
  }

  setZoomBehavior(zoomBehavior?: ZoomBehavior): ViewState {
    return this.clone({zoomBehavior})
  }

  getPlainInitialPosition(): any {
    if (!this.initialPosition) {
      return {}
    }

    const plainInitialPosition = {}
    if (this.initialPosition.getCoordinates()) {
      plainInitialPosition['x'] = this.initialPosition.getCoordinates()!.x
      plainInitialPosition['y'] = this.initialPosition.getCoordinates()!.y
      plainInitialPosition['z'] = this.initialPosition.getCoordinates()!.z
    }

    plainInitialPosition['zoom'] = this.initialPosition.zoom
    plainInitialPosition['bearing'] = this.initialPosition.bearing

    return plainInitialPosition
  }

  getInitialPosition(): Position {
    let coordinates = this.center ?? new Coordinates()

    if (this.initialPosition?.getCoordinates()) {
      coordinates = this.initialPosition.getCoordinates()!
    }

    return new Position({
      x: coordinates.x,
      y: coordinates.y,
      z: coordinates.z,
      zoom: this.getTargetZoom(this.initialPosition?.zoom),
      bearing: this.initialPosition?.bearing ?? 0,
      rotationX: this.initialPosition?.rotationX,
      rotationOrbit: this.initialPosition?.rotationOrbit,
    })
  }

  setZoom(zoom: number): ViewState {
    return this.clone({zoom: this.getTargetZoom(zoom)})
  }

  private translateCoordinatesWithNewCenter(center: Coordinates): Coordinates | undefined {
    if (!this.center || !this.coordinates || this.visualizationType !== VisualizationType.CHART) return this.coordinates
    const displacement = new Coordinates({x: this.center!.x - center.x, y: this.center!.y - center.y})
    return new Coordinates({
      x: this.coordinates!.x - displacement.x,
      y: this.coordinates!.y - displacement.y,
    })
  }

  setCenter(center?: Coordinates): ViewState {
    if (!center || (center.x === this.center?.x && center.y === this.center?.y)) return this
    const coordinates = this.translateCoordinatesWithNewCenter(center)
    return this.clone({center, coordinates})
  }

  setViewport(viewport: OrbitViewport | WebMercatorViewport | OrthographicViewport): ViewState {
    if (!viewport) return this
    return this.clone({viewport})
  }

  getDimensions(): Dimensions | undefined {
    return this.dimensions
  }

  setDimensions(dimensions: Dimensions): ViewState {
    return this.clone({dimensions})
  }

  private isPolygonInRange(polygon: number[][]): boolean {
    return !!this.getViewport()?.isPolygonInRange(polygon)
  }

  private isPointInRange(coordinates: Coordinates, visibleWorld?: Box): boolean {
    // visibleWorld parameter as a optimization option for heavy loads
    return !!this.getViewport()?.isCoordinateInRange(coordinates, visibleWorld)
  }

  isRowInRange(rowCoordinates: RowCoordinates, visibleWorld?: Box): boolean {
    if (rowCoordinates.isGeometryLike()) {
      return this.isPolygonInRange(rowCoordinates.getGeometryLike())
    } else {
      // visibleWorld parameter as a optimization option for heavy loads
      return this.isPointInRange(rowCoordinates.toCoordinates(), visibleWorld)
    }
  }

  projectCommonsToPixel(commons: number, targetZoom?: number, scale?: boolean): number {
    return this.getViewport()?.getSizePixels(commons, 'commons', targetZoom, scale) ?? 0
  }

  projectPixelToCommons(pixel: number, targetZoom?: number, scale?: boolean): number {
    return this.getViewport()?.getSizeCommons(pixel, 'pixels', targetZoom, scale) ?? 0
  }

  setZoomBackPosition(position: Position): ViewState {
    return this.clone({zoomBackPosition: position})
  }

  removeZoomBackPosition(hard = false): ViewState {
    if (hard || this.zoom < (this.zoomBackPosition?.zoom ?? 0)) {
      return this.clone({zoomBackPosition: undefined})
    }

    return this
  }

  transitionZoomBackPosition(): ViewState {
    if (!this.zoomBackPosition) return this
    const cloned = this.clone({zoomBackPosition: undefined})
    return cloned.transition(this.zoomBackPosition, true)
  }

  setAutoRotate(autoRotate: boolean): ViewState {
    return this.clone({autoRotate})
  }

  setAutoNavigate(autoNavigate: boolean): ViewState {
    return this.clone({autoNavigate})
  }

  setContentBox(contentBox?: Box): ViewState {
    if (!contentBox) return this
    return this.clone({
      contentBox: this.visualizationType === VisualizationType.GEO ? contentBox.clamp(GEO_WORLD_BOX) : contentBox,
    })
  }

  fitInitialPositionToContentBox(contentBox: Box): Position {
    if (this.initialPosition.type !== 'FIT_TO_CONTENT') return this.initialPosition

    const fitZoom = this.getFitBoundsZoom(contentBox.getBounds(), getBoundsPadding(this.initialPosition.padding, this.dimensions))
    const fitBearing = getPolygonBearing(contentBox.getPolygon())

    return new Position({
      ...this.initialPosition,
      x: contentBox.x.getCenter(),
      y: contentBox.y.getCenter(),
      z: undefined,
      zoom: fitZoom,
      bearing: fitBearing,
    })
  }

  fitToContentBox(): ViewState {
    if (!this.contentBox || !this.viewport) return this
    const fitPosition = this.fitInitialPositionToContentBox(this.contentBox)
    if (this.coordinates) {
      return this.clone({
        initialPosition: fitPosition,
        coordinates: this.coordinates,
        zoom: this.zoom
      })
    } else {
      return this.clone({
        initialPosition: fitPosition,
        coordinates: fitPosition.getCoordinates(),
        zoom: fitPosition.zoom,
      })
    }
  }

  getPositionKey(): string {
    return `#${Math.floor(this.viewport?.width)}
            #${Math.floor(this.viewport?.height)}
            #${Math.floor(this.zoom)}
            #${Math.floor(this.bearing)}
            #${Math.floor(this.rotationOrbit ?? 0)}
            #${Math.floor(this.rotationX ?? 0)}`
  }
}

export default ViewState
