import { Row } from '@hopara/dataset'
import ViewState from '../../view-state/ViewState'
import { Layer } from '../../layer/Layer'
import { Navigate } from '../../action/Action'
import { getBoundsPadding } from './BoundsPadding'
import { getRowBounds } from './RowBounds'
import { RowCoordinates } from '@hopara/spatial'

function getTargetGeometry(coordinates:RowCoordinates) {
  if (coordinates.isGeometryLike()) {
    return coordinates.getGeometryLike()
  }

  return [coordinates.toArray()]
}

function getCoordinates(row: Row, navigate?: Navigate) {
  if (navigate?.zoom?.field && row && row[navigate.zoom.field]) return row![navigate!.zoom!.field!]
  return getTargetGeometry(row.getCoordinates())
}

function getBearing(viewState: ViewState, navigate?: Navigate) {
  if (navigate?.bearing === false) {
    return viewState.bearing
  }

  return viewState.bearing
}

export const translateBounds = (layer: Layer, row?: Row, viewState?: ViewState, navigate?: Navigate): number => {
  if (!row || !viewState || !viewState.getViewport()) return layer.visible.zoomRange.getMin()

  const coordinates = getCoordinates(row, navigate)
  if ( coordinates.length === 1 && !layer.isResizable()) return layer.getGoToZoom()

  const targetBearing = getBearing(viewState, navigate)
  const bounds = getRowBounds(row, coordinates, viewState, layer, targetBearing)
  const boundsPadding = getBoundsPadding(navigate?.zoom?.padding, viewState.getDimensions()!)
  const fitZoom = Math.max(
    viewState.getFitBoundsZoom(bounds, boundsPadding) as number,
    layer.visible.getZoomRange().getMin(), // Should consider the layer zoom range to avoid zooming out of the layer range
  )

  if (navigate?.zoom?.increment) {
    return fitZoom + navigate?.zoom.increment
  }

  // Should consider the layer zoom range ??
  return fitZoom < 0 ? 0 : fitZoom
}
