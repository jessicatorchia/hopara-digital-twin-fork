import { Row } from '@hopara/dataset'
import ViewState from '../../view-state/ViewState'
import { Layer } from '../../layer/Layer'
import { LayerType } from '../../layer/LayerType'
import { getBBox, getTextBBox } from './BoundingBox'
import { Bounds, OrthographicBounds, WebMercatorBounds } from '@hopara/spatial'

const getCoordinatesBounds = (row: Row, bounds: number[][], viewState: ViewState, referenceLayer: Layer) => {
  let bbox
  if (referenceLayer.isType(LayerType.text)) {
    bbox = getTextBBox(row, bounds, viewState, referenceLayer)
  } else if (referenceLayer.children?.length) {
    bbox = getBBox(bounds, viewState, referenceLayer.children[referenceLayer.children.length - 1])
  } else {
    bbox = getBBox(bounds, viewState, referenceLayer)
  }

  return Bounds.fromBBox(bbox as any, {orthographic: viewState.isOrthographicViewport(viewState.viewport)})
}

const shouldDrawBounds = (rowBounds: any[]) => {
  return rowBounds.length === 1 || (rowBounds.length > 1 && rowBounds[0].toString() !== rowBounds[rowBounds.length - 1].toString())
}

export const getRowBounds = (
  row: Row,
  targetGeometry: number[][],
  viewState: ViewState,
  layer: Layer,
  targetBearing?: number,
): [[number, number], [number, number]] => {
  let bounds: OrthographicBounds | WebMercatorBounds
  if (shouldDrawBounds(targetGeometry)) {
    bounds = getCoordinatesBounds(row, targetGeometry, viewState, layer)!
  } else {
    bounds = Bounds.fromGeometry(targetGeometry, {orthographic: viewState.isOrthographicViewport(viewState.viewport)})
  }

  if (targetGeometry.length > 1) bounds = bounds.rotateToBearing(targetBearing)
  return bounds.getBoundingBox() as unknown as [[number, number], [number, number]]
}
