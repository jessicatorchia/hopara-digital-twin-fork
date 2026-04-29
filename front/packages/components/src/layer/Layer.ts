 
import {get, isNil} from 'lodash/fp'
import {classToPlain, Exclude, Transform, Type, plainToInstance} from 'class-transformer'
import 'reflect-metadata'
import {ColorEncoding, Data, Encodings, ImageEncoding, SizeEncoding, TransformType} from '@hopara/encoding'
import {Rowset} from '../rowset/Rowset'
import {Rowsets} from '../rowset/Rowsets'
import {withDataLoaded} from './Filters'
import {Visible} from './Visible'
import {QueryKey} from '@hopara/dataset/src/query/Queries'
import {LayerType} from './LayerType'
import {Details} from '../details/Details'
import {Actions} from '../action/Actions'
import {Layers} from './Layers'
import {isEmpty} from 'lodash'
import {VisualizationType} from '../visualization/Visualization'
import { SizeUnits } from '@hopara/encoding/src/size/SizeEncoding'
import {LayerTemplateConfig} from './template/domain/LayerTemplate'
import { PositionType } from '@hopara/encoding/src/position/PositionEncoding'
import { QueryHolder } from './QueryHolder'
import { RefreshBehavior } from './RefreshBehavior'
import { container } from 'tsyringe'
import { TransformFactory, TransformFactoryToken } from '../transform/TransformFactory'
import { SimpleTransformFactory } from '../transform/SimpleTransformFactory'

export const NULL_QUERY_KEY = { source: 'noneSource', query: 'noneQuery' }

const renderPropsMap = {
  'composite': ['encoding.position'],
  'bar': ['encoding.position'],
  'circle': ['encoding.position', 'encoding.size', 'encoding.color'],
  'icon': ['encoding.position', 'encoding.size', 'encoding.color'],
  'image': ['encoding.position', 'encoding.image'],
  'line': ['encoding.position', 'encoding.size'],
  'polygon': ['encoding.position'],
  'text': ['encoding.text', 'encoding.position', 'encoding.color', 'encoding.size'],
  'table': [],
  'model': ['encoding.model'],
  'arc': ['encoding.arc', 'encoding.size', 'encoding.color'],
  'area': ['encoding.position', 'encoding.color'],
  'rectangle': ['encoding.position'],
  'map': [],
  'template': [],
} as Record<LayerType, string[]>

const fetchPropsMap = {
  'composite': ['encoding.position'],
  'bar': [],
  'circle': ['encoding.position'],
  'icon': ['encoding.position'],
  'image': ['encoding.position'],
  'line': ['encoding.position'],
  'polygon': ['encoding.position'],
  'text': ['encoding.position'],
  'table': [],
  'model': ['encoding.position'],
  'arc': [],
  'area': ['encoding.position'],
  'map': [],
  'rectangle': ['encoding.position'],
  'template': [],
} as Record<LayerType, string[]>

const transformFactory = container.isRegistered(TransformFactoryToken) ?
                         container.resolve<TransformFactory>(TransformFactoryToken) : 
                         new SimpleTransformFactory()


function parseData(data: any): Data {
  if (data?.transform) {
    return new Data({...data, transform: transformFactory.create(data.transform)})
  }

  return new Data(data)
}

export interface PlainLayer extends Partial<Layer> {
  id: string
}

export class Layer implements QueryHolder {
  private id: string
  name: string
  type: LayerType
  icon?: string
  refreshBehavior?: RefreshBehavior
  scale?: boolean

  @Exclude()
  lastModified: Date

  @Exclude({toPlainOnly: true}) // toPlainOnly to make tests easier
  parentId?: string

  locked?: boolean

  @Exclude()
  currentLocked?: boolean

  getLocked() {
    if (this.currentLocked !== undefined) {
      return this.currentLocked
    }
    return this.locked
  }

  @Type(() => Encodings)
  encoding: Encodings

  @Transform(({value}) => parseData(value), {toClassOnly: true})
  data: Data

  @Transform(({value}) => new Details(value))
  details: Details

  @Transform(({value}) => new Actions(...(value || [])))
  actions: Actions

  helperText?: string

  @Type(() => Visible)
  visible: Visible

  template?: LayerTemplateConfig

  highlight?: boolean

  @Type(() => Layer)
  children?: Layers

  @Exclude({toPlain: true})
  raw: PlainLayer

  getChildren() {
    return this.children ?? new Layers()
  }

  hasChildren(): boolean {
    if (!this.isParent()) {
      return false
    }

    return !isEmpty(this.getChildren())
  }

  isParent() {
    return this.type === LayerType.template || this.type === LayerType.composite
  }

  hasRenderChildren() : boolean {
    if (!this.isParent()) {
      return false
    }

    return !isEmpty(this.getRenderLayers())
  }

  canInteract() {
    return this.id !== 'user-location' && this.id !== 'user-location-accuracy'
  }

  // Recursively finds the layers that are renderable (i.e. !template && !composite)
  getRenderLayers() {
    const renderChildren = new Layers()
    if (this.isParent()) {
      renderChildren.push(...this.getChildren().map((child) => child.getRenderLayers()).flat())
    } else {
      return new Layers(this)
    }

    return renderChildren
  }

  getFlatChildren() {
    const flatChildren = new Layers()
    if (this.isParent()) {
      for (const child of this.getChildren()) {
        flatChildren.push(child)
        flatChildren.push(...child.getFlatChildren().flat())
      }
    }

    return flatChildren
  }

  constructor(props?: PlainLayer) {
    Object.assign(this, props)

    this.lastModified = new Date()
    if (!this.id) this.id = crypto.randomUUID()
    if (this.data) this.data = new Data(this.data)
    this.children = new Layers(...(this.children ?? []))
  }

  getLastModified(): Date | undefined {
    if (isEmpty(this.children)) {
      return this.lastModified
    }

    let lastModifieds = this.children!.map((child) => child.getLastModified())
    lastModifieds?.push(this.lastModified)
    lastModifieds = lastModifieds.filter((lastModified) => !isNil(lastModified))
    if (isEmpty(lastModifieds)) {
      return undefined
    }

    return new Date(Math.max(...lastModifieds.map((lm) => lm?.getTime()) as any[]))
  }

  setLastModified(lastModified: Date): void {
    this.lastModified = lastModified
  }

  clone(): Layer {
    return new Layer({
      ...this,
      id: this.id,
      parentId: this.parentId,
      raw: {...this.raw},
      children: this.children?.map((child) => child.clone()),
    })
  }

  setLocked(locked: boolean): Layer {
    const cloned = this.clone()
    cloned.currentLocked = locked
    return cloned
  }

  isVisible(zoom: number): boolean {
    return this.visible.value && this.belongsToZoom(zoom)
  }

  belongsToZoom(zoom: number): boolean {
    return !this.visible?.zoomRange || (this.visible?.zoomRange && this.visible?.zoomRange.isInRange(zoom))
  }

  shouldRender(rowsets: Rowsets): boolean {
    return this.isRenderable() && withDataLoaded(rowsets)(this)
  }

  isType(type: string) {
    if (!this.type) {
      return false
    }

    return this.type.toLowerCase() === type.toLowerCase()
  }

  isOneOf(types: LayerType[]) {
    return types.some((type) => this.isType(type))
  }

  getData(): Data {
    return this.data
  }

  getBaseQueryKey(): QueryKey {
    return this.data?.getBaseQueryKey()
  }

  getQueryKey(): QueryKey {
    return this.data?.getQueryKey()
  }

  hasTransform() {
    return !!this.data?.transform
  }

  getTransform() {
    return this.data?.transform
  }

  hasData() {
    return this.data?.query && this.data?.source
  }

  getPositionQueryKey(): QueryKey {
    const positionData = this.encoding?.position?.data
    if (!positionData) return this.getQueryKey()
    if (positionData instanceof Data) return positionData.getBaseQueryKey()

    return NULL_QUERY_KEY
  }

  allowCategoricalAxis(): boolean {
    return this.isType(LayerType.bar)
  }

  getPositionData(): Data {
    if (this.encoding?.position?.data) {
      return this.encoding?.position?.data
    }

    return this.data
  }

  isManagedPositionEncoding() {
    return !!(this.getPositionEncoding()?.isOfType(PositionType.MANAGED))
  }

  isManagedData() {
    return this.data.isInternal()
  }

  canSetObjectAppearance() : boolean {
    return this.isManagedPositionEncoding() && this.isManagedData() &&
           !this.isType(LayerType.model) && !this.isType(LayerType.image)
  }

  hasPosition() {
    return !!this.encoding?.position?.isRenderable()
  }

  getPositionEncoding() {
    return this.encoding?.position
  }

  getRowset(): Rowset | undefined {
    if (!this.isFetchable()) return

    return new Rowset({
      data: this.getData(),
      positionData: this.getPositionData(),
      positionEncoding: this.getPositionEncoding(),
      refreshBehavior: this.refreshBehavior,
    })
  }

  getRawId(): string {
    return this.id
  }

  getId(): string {
    if (this.parentId) {
      return `${this.parentId}-${this.id}`
    }

    return this.id
  }

  getRowsetId(): string {
    const rowset = this.getRowset()
    return rowset?.getId() ?? 'not_found'
  }

  isPropRenderable(propPath) {
    if (propPath === 'encoding.position' && this.hasParent()) {
      return true
    }

    const prop = get(propPath, this)
    if (!prop) return false

    if (propPath === 'encoding.position' && this.isType(LayerType.line)) {
      return prop.hasOneAxis()
    }

    if (prop.isRenderable) {
      return prop?.isRenderable()
    }

    return !!prop
  }

  arePropsRenderable(): boolean {
    const requiredProps = renderPropsMap[this.type] ?? []
    return requiredProps.map(this.isPropRenderable.bind(this)).every(Boolean)
  }

  arePropsFetchable(): boolean {
    const requiredProps = fetchPropsMap[this.type] ?? []
    return requiredProps.map(this.isPropRenderable.bind(this)).every(Boolean)
  }

  isTransformFetchable() {
    if (!this.data?.transform) {
      return true
    }

    return this.data.transform.isFetchable()
  }

  isDataFetchable(): boolean {
    return !!this.data && !!this.data.query && !!this.data.source && this.isTransformFetchable()
  }

  isRenderable(): boolean {
    return this.visible.value && this.arePropsRenderable() && this.isDataFetchable()
  }

  isFetchable(): boolean {
    return this.arePropsFetchable() && this.isDataFetchable()
  }

  hasPlaceTransform() {
    return this.getTransformType() === TransformType.place
  }

  getTransformType() {
   return this.getData()?.transform?.type
  }

  canMove(canWriteToDatabase: boolean | undefined): boolean {
    if (this.hasTransform() && !this.hasPlaceTransform()) {
      return false
    }

    return !!canWriteToDatabase && !this.encoding?.position?.isFixed() && !this.encoding?.position?.isOfType(PositionType.REF)
  }

  canPlace(canWriteToDatabase?: boolean) {
    if (this.getLocked()) {
      return false
    }
    return this.isPlaceable(canWriteToDatabase)
  }

  cantPlaceReason(canWriteToDatabase?: boolean) {
    if (this.getLocked()) {
      return 'LOCKED'
    }

    if (this.hasTransform() && !this.hasPlaceTransform()) {
      return 'TRANSFORM'
    }

    if (!this.visible.value) {
      return 'VISIBLE'
    }

    if (!this.arePropsRenderable()) {
      return 'RENDERABLE'
    }

    if (!canWriteToDatabase) {
      return 'QUERY'
    }

    if (this.encoding?.position?.isFixed()) {
      return 'POSITION_FIXED'
    }

    if (this.encoding?.position?.isOfType(PositionType.REF)) {
      return 'POSITION_REF'
    }

    return undefined
  }

  isPlaceable(canWriteToDatabase?: boolean) {
    if (this.hasTransform()) {
      return false
    }
    // We only check renderable on canPlace because of composite vs deck callback
    return this.canMove(canWriteToDatabase) && this.isRenderable()
  }

  canAnimate(visualizationType: VisualizationType): boolean {
    return this.isType(LayerType.circle) ||
      this.isType(LayerType.polygon) ||
      this.isType(LayerType.icon) ||
      (this.isType(LayerType.line) && visualizationType !== VisualizationType.CHART)
  }

  isCoordinatesBased(): boolean {
    return this.isType(LayerType.polygon) ||
      this.isType(LayerType.image) ||
      this.isType(LayerType.line) || 
      (this.isParent() && 
        this.hasRenderChildren() && 
        this.getRenderLayers()!.some((child) => child.isCoordinatesBased()) 
      )
  }

  hasType(type: LayerType) {
    if (this.isParent()) {
      return this.getRenderLayers()!.some((child) => child.isType(type))
    } else {
      return this.isType(type)
    }
  }

  isChart(): boolean {
    return [LayerType.bar, LayerType.line, LayerType.area, LayerType.arc, LayerType.rectangle].includes(this.type)
  }

  isModel(): boolean {
    return this.isType(LayerType.model)
  }

  hasParent() {
    return !!this.parentId
  }

  setParentId(parentId:string | undefined) {
    this.parentId = parentId
    return this
  }

  getParent(layers: Layers): Layer | undefined {
    return layers.getById(this.parentId)
  }

  private getEncoding(name: string) {
    if (this.encoding && this.encoding[name]) {
      return this.encoding[name]
    }

    if (this.children) {
      const encodingChildren = this.children.find((children) => children.encoding && !!children.encoding[name])
      if (encodingChildren) {
        return encodingChildren.encoding[name]
      }
    }

    return undefined
  }

  getColorEncoding(): ColorEncoding | undefined {
    return this.getEncoding('color')
  }

  getLegendColorEncoding(): ColorEncoding | undefined {
    if (this.isType(LayerType.composite)) {
      return this.children?.find((child) => child.canCreateLegend())?.getColorEncoding()
    }

    return this.getColorEncoding()
  }

  canCreateLegend() {
    if (this.isType(LayerType.composite)) {
      return this.children?.some((child) => child.canCreateLegend())
    }

    return this.getColorEncoding()?.canCreateLegend()
  }

  getSizeEncoding(): SizeEncoding | undefined {
    return this.getEncoding('size')
  }

  getImageEncoding(): ImageEncoding | undefined {
    return this.getEncoding('image')
  }

  hasColorEncoding() {
    return !!this.getColorEncoding()
  }

  hasSizeEncoding() {
    return !!this.getSizeEncoding()
  }

  toRaw() {
    // To remove the excludePlain attributes
    return classToPlain(plainToInstance(Layer, this.raw))
  }

  static fromPlain(plain: any) {
    return plainToInstance(Layer, plain)
  }

  getGoToZoom() {
    return this.visible.getZoomRange().getMaxVisible()
  }

  isResizable() {
    return this.encoding?.config?.units === SizeUnits.COMMON
  }

  canUpload() {
    return this.isType(LayerType.image) || this.isType(LayerType.model)
  }

  shouldHighlight(canWriteToDatabase: boolean | undefined) {
    if (!this.canMove(canWriteToDatabase)) {
      return false
    }

    return this.isType(LayerType.text) ||
           this.isType(LayerType.icon) ||
           this.isType(LayerType.line) ||
           this.isType(LayerType.circle) ||
           this.isType(LayerType.polygon)
  }

  canSelect(canWriteToDatabase: boolean | undefined): boolean {
    if (this.canUpload()) {
      return true
    }

    return this.canMove(canWriteToDatabase)
  }
}

