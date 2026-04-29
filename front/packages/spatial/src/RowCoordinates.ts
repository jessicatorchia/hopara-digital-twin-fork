import {isArray, isNil, isNumber, isObjectLike} from 'lodash/fp'
import {AllGeoJSON, lineString, point, polygon} from '@turf/helpers'
import centerOfMass from '@turf/center-of-mass'
import {Coordinates} from './Coordinates'
import { Box } from './Box'
import {Range} from './Range'
import bbox from '@turf/bbox'
import { Anchor } from './Anchor'

export class RowCoordinates {
  private readonly x: number | any[]
  private readonly y: number | any[]
  private readonly z: number | any[]
  private readonly geometry: any[]
  private detailedGeometry: any[]
  private floor: any
  private readonly placed: boolean
  private projected: boolean
  private snapReference: Coordinates

  constructor(props: any = {}) {
    if (!props) {
      props = {}
    }

    this.x = props.x
    this.y = props.y
    this.z = props.z
    this.floor = props.floor
    this.geometry = props.geometry
    this.detailedGeometry = props.detailedGeometry
    this.placed = !((isNil(props.x) || isNil(props.y)) && isNil(props.geometry))
    this.projected = props.projected
    this.snapReference = props.snapReference
  }

  setProjected(projected: boolean) {
    this.projected = projected
  }

  isSnapped(): boolean {
    return !!this.snapReference
  }

  getSnapReference(): Coordinates {
    return this.snapReference
  }

  setSnapReference(reference: Coordinates) {
    this.snapReference = reference
    return this
  }

  isProjected(): boolean {
    return !!isNil(this.projected)
  }

  hasZ(): boolean {
    return !isNil(this.z)
  }

  setFloor(floor: any) {
    this.floor = floor
  }

  isPoint(value: any[]): boolean {
    return value.length === 1
  }

  isPlaced(): boolean {
    return this.placed
  }

  isPolygon(value: any[]): boolean {
    return value[0][0] === value[value.length - 1][0] &&
      value[0][1] === value[value.length - 1][1]
  }

  buildGeometry(value: any): AllGeoJSON {
    if (isArray(value)) {
      if (this.isPoint(value)) return point(value[0])
      if (this.isPolygon(value)) return polygon([value])
      return lineString(value)
    }

    return value
  }

  isPointGeometry(value: any) {
    return value.length === 1
  }

  getAnchoredValue(value: any, anchor?: Anchor): [number, number, number?] {
    try {
      if (this.isPointGeometry(value)) {
        return value[0]
      }

      const geometry = this.buildGeometry(value)
      if ( anchor === Anchor.CENTROID || !anchor ) {
        const centroidGeoJson = centerOfMass(geometry)
        return centroidGeoJson.geometry.coordinates as [number, number, number?]
      }

      const [minX, minY, maxX, maxY] = bbox(geometry)
      if ( anchor === Anchor.TOP_CENTER) {
        return [(minX + maxX) / 2, maxY, 0]
      } else if ( anchor === Anchor.BOTTOM_CENTER) {
        return [(minX + maxX) / 2, minY, 0]
      } else if ( anchor === Anchor.RIGHT_CENTER ) {
        return [maxX, (minY + maxY) / 2, 0]
      } else if ( anchor === Anchor.LEFT_CENTER ) {
        return [minX, (minY + maxY) / 2, 0]
      }
    } catch {
      // ignore errors
    }

    return [0, 0]
  }

  isGeometry(value: any) {
    return isObjectLike(value)
  }

  getValue(coordinate: number | any[], index: number, anchor?: Anchor): number {
    if (this.isGeometry(coordinate)) {
      return this.getAnchoredValue(coordinate, anchor)[index] as number
    }

    return coordinate as number
  }

  getGeometry(): any[] {
    return this.geometry
  }

  getDetailedGeometry(): any[] {
    return this.detailedGeometry
  }

  setDetailedGeometry(geometry: any[]) {
    this.detailedGeometry = geometry
  }
  
  hasGeometry(): boolean {
    return !!this.geometry
  }

  hasDetailedGeometry(): boolean {
    return !!this.detailedGeometry
  }

  isGeometryLike(): boolean {
    return this.hasGeometry() || (this.isGeometry(this.getX()) && this.isGeometry(this.getY()))
  }

  getGeometryLike(detailedFirst = false): any[] {
    if ( detailedFirst ) {
      if ( this.hasDetailedGeometry() ) {
        return this.detailedGeometry
      }
      
      if (this.hasGeometry()) {
        return this.geometry
      }
    } else {
      if (this.hasGeometry()) {
        return this.geometry
      }

      if ( this.hasDetailedGeometry() ) {
        return this.detailedGeometry
      }
    }

    return this.getX() as any
  }

  getX(): number | any[] {
    return this.x ?? 0
  }

  getY(): number | any[] {
    return this.y ?? 0
  }

  getZ(): number | any[] {
    return this.z ?? 0
  }

  getFloorName(): any {
    return this.floor
  }

  getAnchoredX(anchor?: Anchor): number {
    if (this.geometry) {
      return this.getValue(this.geometry, 0, anchor)
    }

    return this.getValue(this.getX(), 0, anchor)
  }

  getAnchoredY(anchor?: Anchor): number {
    if (this.geometry) {
      return this.getValue(this.geometry, 1, anchor)
    }

    return this.getValue(this.getY(), 1, anchor)
  }

  getCentroidX(): number {
    return this.getAnchoredX(Anchor.CENTROID)
  }

  getCentroidY(): number {
    return this.getAnchoredY(Anchor.CENTROID)
  } 

  getCentroidZ(): number {
    if (isNumber(this.getZ())) {
      return this.getZ() as number
    }

    if (this.isGeometry(this.getZ()) && this.isPoint(this.getZ() as any[])) {
      return this.getZ()[0][2]
    }

    return 0
  }

  static fromArray(xyz: any) {
    if (!xyz) {
      return new RowCoordinates()
    }

    return new RowCoordinates({x: xyz[0], y: xyz[1], z: xyz[2]})
  }

  static fromGeometry(geometry: any) {
    if (!geometry) {
      return new RowCoordinates()
    }

    return new RowCoordinates({geometry})
  }

  toBox() : Box {
    if (!this.isGeometryLike()) {
      return new Box({x: new Range(), y: new Range()})
    }

    const box = bbox(this.buildGeometry(this.getGeometryLike()))
    const x = new Range({min: box[0], max: box[2]})
    const y = new Range({min: box[1], max: box[3]})
    return new Box({x, y})
  }

  toArray(anchor?:Anchor): [number, number, number] {
    return [this.getAnchoredX(anchor), this.getAnchoredY(anchor), this.getCentroidZ()]
  }

  to2DArray(anchor?:Anchor) {
    return [this.getAnchoredX(anchor), this.getAnchoredY(anchor)]
  }

  toCoordinates(anchor?:Anchor) {
      return new Coordinates({x: this.getAnchoredX(anchor), y: this.getAnchoredY(anchor), z: this.getCentroidZ()})
  }
}
