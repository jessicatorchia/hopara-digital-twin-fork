import { RowsetStore } from './RowsetStore'
import actions, { ActionTypes } from '../state/Actions'
import { getType } from 'typesafe-actions'
import { RowsetStatus } from './RowsetStatus'
import { Rowset } from './Rowset'
import { PositionNormalizer, RowProjector } from '@hopara/projector'
import { Row } from '@hopara/dataset'
import { Reducer } from '@hopara/state'
import { RowCoordinates } from '@hopara/spatial'
import { isEmpty } from 'lodash'
import { RefreshBehavior } from '../layer/RefreshBehavior'

const positionNormalizer = new PositionNormalizer()

function normalizeRowset(rowset: Rowset) {
  const normalizedRows = positionNormalizer.normalizeRows(rowset.rows, rowset.positionEncoding)
  return new Rowset({ ...rowset, rows: normalizedRows })
}

export function getUnprojectedRow(row: Row, projector: any) {
  if (projector) {
    const rowProjector = new RowProjector(projector)
    return rowProjector.unproject(row)
  }
  return row
}

export const rowsetStoreReducer: Reducer<RowsetStore, ActionTypes> = (rowsetStore = new RowsetStore(), action, globalState) => {
  switch (action.type) {
    case getType(actions.visualization.listVisualizationPageLoaded):
      return new RowsetStore()
    case getType(actions.filter.valueChanged):
    case getType(actions.filter.dateChanged):
    case getType(actions.filter.fieldChanged):
    case getType(actions.filter.changed):
    case getType(actions.filter.comparisonTypeChanged):
    case getType(actions.navigation.floorChangeRequested):
    case getType(actions.layer.positionEncodingChanged):
    case getType(actions.layer.positionTypeChanged):
    case getType(actions.layer.visibilityChanged):
    case getType(actions.layer.codeChanged):
    case getType(actions.hoc.forceRefresh):
    case getType(actions.hoc.filterChanged):
    case getType(actions.hoc.loaderChanged):
      return rowsetStore.invalidateAll()
    case getType(actions.query.changed):
      return rowsetStore.invalidateAll()
    case getType(actions.layer.transformChanged):
      if (action.payload.transform && !action.payload.transform.isFrontOnly()) {
        return rowsetStore.invalidateAll()
      }
      return rowsetStore
    case getType(actions.rowset.rowSave.success): {
      const rowset = rowsetStore.rowsets[action.payload.rowsetId]
      if (rowset.refreshBehavior === RefreshBehavior.ALL) {
        return rowsetStore.invalidateAll()
      } else if (rowset.refreshBehavior === RefreshBehavior.SELF) {
        return rowsetStore.invalidateById(action.payload.rowsetId)
      } else if (rowset.refreshBehavior === RefreshBehavior.OTHERS) {
        return rowsetStore.invalidateAllBut(action.payload.rowsetId)
      }

      return rowsetStore
    }
    case getType(actions.rowset.rowUpdated): {
      let updatedStore = rowsetStore
      rowsetStore.getRowsets().withData(action.payload.data).forEach((rowset) => {
        updatedStore = updatedStore.partialUpdateRow(rowset.getId(), action.payload.rowId, action.payload.row)
      })
      return updatedStore
    }
    case getType(actions.rowset.rowPositionUpdated): {
      let updatedStore = rowsetStore
      rowsetStore.getRowsets().withData(action.payload.data).forEach((rowset) => {
        updatedStore = updatedStore.partialUpdateRow(rowset.getId(), action.payload.rowId, action.payload.row, true)
      })
      return updatedStore
    }
    case getType(actions.userLocation.show.success):
    case getType(actions.userLocation.refresh.success): {
      const userLocationLayers = globalState.layerStore.userLocationLayers
      if (isEmpty(userLocationLayers)) {
        return rowsetStore
      }

      const rowset = userLocationLayers[0].getRowset()
      const row = new Row({ _id: 1 }).updateCoordinates(new RowCoordinates({ ...action.payload.coordinates }))
      return rowsetStore.createRowsetIfNotExists(rowset)
        .updateRow(rowset.getId(), row)
    }
    case getType(actions.rowset.fetch.request):
      return rowsetStore.setStatus(action.payload.rowset, RowsetStatus.LOADING)
    case getType(actions.rowset.fetch.success): {
      return rowsetStore.immutableAdd(normalizeRowset(action.payload.rowset))
        .setStatus(action.payload.rowset, RowsetStatus.LOADED)
    }
    // Indicates an in progress change (e.g. user dragging), in this case we'll only update the back when the user finishes
    case getType(actions.viewLayer.dragEnded):
    case getType(actions.object.unplaced):
    case getType(actions.object.placed):
    case getType(actions.image.boundsCreated):
    case getType(actions.image.previewBoundsCreated): {
      return rowsetStore
        .createRowsetIfNotExists(globalState.layerStore.layers.getById(action.payload.layerId).getRowset())
        .updateRow(
          action.payload.rowsetId,
          getUnprojectedRow(
            action.payload.row.updateCoordinates(action.payload.rowCoordinates),
            globalState.chart.projector
          )
        )
    }
    case getType(actions.rowHistory.rowUndoRequested): {
      return rowsetStore.updateRow(
        action.payload.rowsetId,
        getUnprojectedRow(
          action.payload.row,
          globalState.chart.projector
        )
      )
    }
    case getType(actions.rowset.rowFieldsSaveRequested):
      return rowsetStore.partialUpdateRow(action.payload.rowsetId, action.payload.row.getId()!, action.payload.updateRowData)
    case getType(actions.object.create.success):
    case getType(actions.rowset.rowPositionSaveRequested):
      return rowsetStore.updateRow(action.payload.rowsetId, action.payload.row)
    case getType(actions.object.delete.success):
      return rowsetStore.deleteRow(action.payload.rowsetId, action.payload.row)
    case getType(actions.rowset.fetch.failure):
      if (action.payload.rowset) {
        return rowsetStore.setStatus(action.payload.rowset, RowsetStatus.ERROR)
      }
      return rowsetStore
    case getType(actions.floor.changed):
    case getType(actions.rowset.refresh):
      return rowsetStore.invalidateAll()
    case getType(actions.view.chartCreated):
    case getType(actions.view.chartUpdated): {
      return rowsetStore.updateAllEtagModifier('projector', action.payload.projector.createdTimestamp.valueOf())
    }
    case getType(actions.objectList.fetch.request): {
      const layer = globalState.layerStore.layers.getByRowsetId(action.payload.rowsetId)
      return rowsetStore.createRowsetIfNotExists(layer!.getRowset())
    }
    default:
      return rowsetStore
  }
}

