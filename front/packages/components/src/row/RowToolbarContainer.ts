import {Dispatch} from '@reduxjs/toolkit'
import {connect} from '@hopara/state'
import {Store} from '../state/Store'
import {ActionProps, RowToolbar, StateProps} from './RowToolbar'
import actions from '../state/Actions'
import {ViewLayerEditingMode} from '../view-layer/ViewLayerStore'
import {LayerType} from '../layer/LayerType'
import {getSelectedLayer} from '../view-layer/deck/interaction/RowSelection'
import {isEmpty, isNil} from 'lodash'
import {getImageCandidates} from '../fit/ImageCandidates'
import {RowSavedStatus} from './RowHistoryStore'
import {Coordinates, toGeometry, toPoint, toPolygon} from '@hopara/spatial'
import {useMemo} from 'react'
import ViewState from '../view-state/ViewState'
import {Row, Rows} from '@hopara/dataset'
import {Layer} from '../layer/Layer'
import {isEqual} from 'lodash/fp'
import {getRowBounds} from '../zoom/translate/RowBounds'
import {ResourceGenerateStatus, ResourceUploadState, ResourceUploadStatus} from '../resource/ResourceStore'
import {isLayerVisible} from '../layer/LayerVisiblity'
import { Z_INDEX_COLUMN_NAME } from '@hopara/dataset'
import { geometricFromViewport } from '../geometric/GeometricFactory'

const getProgressType = (resourceUpload?: ResourceUploadState) => {
  if (!resourceUpload?.status || resourceUpload.status === ResourceUploadStatus.UPLOADED || resourceUpload.status === ResourceUploadStatus.PARTIAL) return
  if (resourceUpload.status === ResourceUploadStatus.UPLOADING && resourceUpload.progress === 1) return 'processing'
  return 'uploading'
}

const isAutoPlaced = (rowGeometry: any[], selectedLayer: Layer) => {
  return selectedLayer.hasPlaceTransform() && (
    !rowGeometry ||
    !rowGeometry.length ||
    (rowGeometry.length === 1 && isEqual([0, 0, 0], rowGeometry[0]))
  )
}

const getRowTopMidPointScreenCoordinates = (row: Row, selectedLayer: Layer, viewState: ViewState) => {
  const rowCoordinates = row.getCoordinates()
  const rowGeometry = rowCoordinates.isGeometryLike() ? rowCoordinates.getGeometryLike() : [rowCoordinates.toArray()]

  if (!viewState.isRowInRange(rowCoordinates)) return []
  if (isAutoPlaced(rowGeometry, selectedLayer)) return [viewState.dimensions.width / 2, 0, 0]

  const geometric = geometricFromViewport(viewState!.viewport)

  let rowBounds: any
  if (selectedLayer.isCoordinatesBased()) {
    rowBounds = geometric.getBounds(toGeometry(rowGeometry))
  } else {
    rowBounds = getRowBounds(row!, rowGeometry, viewState!, selectedLayer).flat()
  }

  const rotatedRowBounds = geometric.polygonRotate(toPolygon([
    [rowBounds[0], rowBounds[1]],
    [rowBounds[2], rowBounds[1]],
    [rowBounds[2], rowBounds[3]],
    [rowBounds[0], rowBounds[3]],
    [rowBounds[0], rowBounds[1]]
  ]), (viewState?.bearing ?? 0) * -1, toPoint(rowCoordinates.to2DArray()))

  const rotatedBoundsBBox = geometric.getBBox(rotatedRowBounds)
  const rotatedBBox = geometric.polygonRotate(rotatedBoundsBBox, (viewState?.bearing ?? 0), toPoint(rowCoordinates.to2DArray()))
  const midpoint = geometric.getTopMidPoint(rotatedBBox).geometry.coordinates

  return rowCoordinates ? viewState?.projectCoordinate(Coordinates.fromArray(midpoint))! : []
}

const getResourceKey = (layer?: Layer, row?: Row) => {
  if (layer?.isModel()) {
    return {
      library: layer.encoding.model?.scope,
      resourceId: layer.encoding.model?.getId(row)
    }
  }

  return {
    library: layer?.encoding?.image?.scope!,
    resourceId: layer?.encoding?.image?.getId(row)
  }
}

const mapState = (store: Store): StateProps => {
  const visualization = store.visualizationStore.visualization
  const selectedLayer = store.viewLayers.rowSelection ? getSelectedLayer(store.viewLayers.rowSelection, store.layerStore.layers) : undefined
  const row = store.rowsetStore.getRow(selectedLayer?.getRowsetId(), store.viewLayers.rowSelection?.rowId)
  const positionQuery = store.queryStore.queries.findQuery(selectedLayer?.getPositionQueryKey())
  const canPlace = !!selectedLayer?.canPlace(positionQuery?.canUpdate())
  const isCropMode = store.viewLayers.isEditingModeType(selectedLayer?.type, ViewLayerEditingMode.CROP)
  const unplaceVisible = !!(row?.isPlaced() && canPlace)

  const undoVisible = !!store.rowHistory.status ||
    unplaceVisible ||
    [LayerType.polygon, LayerType.model, LayerType.image].includes(selectedLayer!.type)


  const {library, resourceId} = getResourceKey(selectedLayer, row)
  const uploadState = store.resource.getUpload(library!, resourceId)
  const generateState = store.resource.getGenerate(library!, resourceId)

  const status = getProgressType(uploadState)
  const progress = uploadState?.status === ResourceUploadStatus.UPLOADING ? (uploadState.progress ?? 0) * 100 : undefined
  const canUpload = selectedLayer?.canUpload() &&
    (selectedLayer?.encoding.image?.getId(row) || selectedLayer?.encoding.model?.getId(row))

  const canFit = !!row?.isPlaced()
    && !!selectedLayer && (selectedLayer.isType(LayerType.image) || selectedLayer.isType(LayerType.polygon))
  const canFitToBuilding = canFit && visualization.isGeo()
  const canFitToImage = canFit && !isEmpty(getImageCandidates(store.layerStore.layers, selectedLayer.visible?.zoomRange?.min?.value))

  const screenCoordinates = useMemo(() => {
    if (!row || !selectedLayer) return []
    return getRowTopMidPointScreenCoordinates(row, selectedLayer, store.viewState!)
  }, [row, selectedLayer, store.viewState])

  return {
    hasUndoRow: !!store.rowHistory.last(),
    rowSavedStatus: store.rowHistory.status,
    selectedViewLayerEditMode: store.viewLayers.getEditingMode(selectedLayer?.type),
    visualization: store.visualizationStore.visualization,
    layer: selectedLayer,
    undoVisible,
    unplaceVisible,
    canUpdateOrder: !isNil(row?.getValue(Z_INDEX_COLUMN_NAME)),
    layerType: selectedLayer?.type!,
    rowsetId: selectedLayer?.getRowsetId(),
    row,
    status,
    progress,
    isCropMode,
    canUpload,
    isCropping: !!store.viewLayers.crop?.status,
    isCropLoading: store.viewLayers.crop?.status === 'loading',
    canCrop: row?.isPlaced(),
    canFitToImage,
    canFitToBuilding,
    isFitting: store.rowHistory.status === RowSavedStatus.fitting,
    visible: store.navigation.visible,
    screenCoordinates,
    isGeneratingImage: generateState?.status === ResourceGenerateStatus.GENERATING,
    allowRotation: !!(store.viewLayers.rowSelection?.allowRotation),
    allowImageEdit: !!(store.viewLayers.rowSelection?.allowImageEdit),
    hasViewField: !!(selectedLayer?.encoding.image?.view?.field) && positionQuery?.getColumns().has(selectedLayer.encoding.image.view.field),
    rows: store.rowsetStore.getRowset(selectedLayer?.getRowsetId())?.rows ?? Rows.empty()
  }
}

const mapActions = (dispatch: Dispatch, stateProps: StateProps): ActionProps => {
  return {
    onUndoClick: () => {
      dispatch(actions.object.undoRequest())
    },
    onViewLayerEditModeClick: (mode: ViewLayerEditingMode) => {
      dispatch(actions.rowToolbar.onViewLayerEditModeClicked({mode}))
    },
    onUnplaceClick: () => {
      dispatch(actions.object.unplaceRequest())
    },
    onFitToImageClick() {
      dispatch(actions.fit.fitToImage.request({
        layerId: stateProps.layer!.getId(),
        row: stateProps.row!,
        rowsetId: stateProps.layer!.getRowsetId()
      }))
    },
    onFitToRoomClick() {
      dispatch(actions.fit.fitToRoom.request({
        layerId: stateProps.layer!.getId(),
        row: stateProps.row!,
        rowsetId: stateProps.layer!.getRowsetId()
      }))
    },
    onFitToBuildingClick() {
      dispatch(actions.fit.fitToBuilding.request({
        layerId: stateProps.layer!.getId(),
        row: stateProps.row!,
        rowsetId: stateProps.layer!.getRowsetId()
      }))
    },
    onReplaceImageClick: (imageFile: File) => {
      if (!stateProps.layer) return
      if (!stateProps.row) return
      if (!stateProps.layer.encoding?.image?.isRenderable() || isNil(stateProps.rowsetId)) return
      const resourceId = stateProps.layer.encoding?.image.getId(stateProps.row)
      if (isNil(resourceId)) return

      dispatch(actions.image.upload.request({
        layerId: stateProps.layer?.getId(),
        rowsetId: stateProps.rowsetId,
        row: stateProps.row,
        file: imageFile,
        library: stateProps.layer.encoding.image.scope!,
        resourceId
      }))
    },
    onShowImageHistoryClick: () => {
      const resourceId = stateProps?.layer?.encoding?.image?.getId(stateProps?.row)
      if (!resourceId) return

      dispatch(actions.details.open({
        layerId: stateProps.layer!.getId(),
        row: stateProps.row
      }))
      dispatch(actions.details.imageHistoryOpenClicked({
        layerId: stateProps.layer!.getId(),
        rowId: stateProps.row!._id!,
        library: stateProps.layer?.encoding.image?.scope,
        resourceId
      }))
    },
    onShowModelHistoryClick: () => {
      const resourceId = stateProps?.layer?.encoding?.model?.getId(stateProps.row)
      if (!resourceId) return

      dispatch(actions.details.open({
        layerId: stateProps.layer!.getId(),
        row: stateProps.row
      }))
      dispatch(actions.details.modelHistoryOpenClicked({
        layerId: stateProps.layer!.getId(),
        rowId: stateProps.row!._id!,
        library: stateProps.layer?.encoding.model?.scope,
        resourceId
      }))
    },
    onReplaceModelClick: (modelFile: File) => {
      if (!stateProps.layer) return
      if (!stateProps.row) return
      if (!stateProps.layer.encoding?.model) return

      const resourceId = stateProps.layer.encoding.model.getId(stateProps.row)
      if (!resourceId) return

      dispatch(actions.model.upload.request({
        layerId: stateProps.layer.getId(),
        resourceId,
        file: modelFile,
        library: stateProps.layer.encoding.model.scope!,
        row: stateProps.row,
        rowsetId: stateProps.rowsetId!
      }))
    },
    onBringToFrontClick: () => {
      const zValues = stateProps.rows.getValues(Z_INDEX_COLUMN_NAME).filter((v): v is number => !isNil(v))
      const maxZ = zValues.reduce((acc, v) => v > acc ? v : acc, 0)
      dispatch(actions.object.zIndexUpdated({
        row: stateProps.row!,
        updatedFields: {
          [Z_INDEX_COLUMN_NAME]: maxZ + 1
        },
        rowsetId: stateProps.rowsetId!,
        data: stateProps.layer!.getPositionData()
      }))
    },
    onSendToBackClick: () => {
      const zValues = stateProps.rows.getValues(Z_INDEX_COLUMN_NAME).filter((v): v is number => !isNil(v))
      const minZ = zValues.reduce((acc, v) => v < acc ? v : acc, 0)
      dispatch(actions.object.zIndexUpdated({
        row: stateProps.row!,
        updatedFields: {
          [Z_INDEX_COLUMN_NAME]: minZ - 1
        },
        rowsetId: stateProps.rowsetId!,
        data: stateProps.layer!.getPositionData()
      }))
    },
    onCropApply: () => {
      dispatch(actions.viewLayer.cropApplyClicked())
    },
    onCropCancel: () => {
      dispatch(actions.viewLayer.cropCancelClicked())
    },
    onGenerateIsometricClick: () => {
      const resourceId = stateProps.layer!.encoding.image!.getId(stateProps.row)
      if (!resourceId) return

      dispatch(actions.rowToolbar.generateIsometricClicked({
        layerId: stateProps.layer!.getId(),
        resourceId,
        library: stateProps.layer!.encoding.image!.scope!,
        row: stateProps.row!,
        rowsetId: stateProps.rowsetId!
      }))
    },
    onProjectToIsometricClick: () => {
      const resourceId = stateProps.layer!.encoding.image!.getId(stateProps.row)
      if (!resourceId) return

      dispatch(actions.rowToolbar.projectToIsometricClicked({
        layerId: stateProps.layer!.getId(),
        resourceId,
        library: stateProps.layer!.encoding.image!.scope!,
        row: stateProps.row!,
        rowsetId: stateProps.rowsetId!
      }))
    },
    onLoad: () => {
      dispatch(actions.rowToolbar.onLoad())
    },
    onRotateClicked: () => {
      dispatch(actions.rowToolbar.rotateRequested())
    },
  }
}

const shouldRender = (store: Store) => {
  if (isNil(store.viewLayers.rowSelection?.rowId) || !store.viewLayers.rowSelection) {
    return false
  }

  const selectedLayer = store.layerStore.layers.getById(store.viewLayers.rowSelection.layerId)
  if (!selectedLayer || !isLayerVisible(selectedLayer, store.viewState?.zoom!, selectedLayer.getId())) {
    return false
  }

  const row = store.rowsetStore.getRow(selectedLayer.getRowsetId(), store.viewLayers.rowSelection?.rowId)
  return store.visualizationStore.isOnObjectEditor() && !store.viewController?.hasActiveEvent()
    && (!!row?.isPlaced() || selectedLayer.hasPlaceTransform())
}

export const RowToolbarContainer = connect(mapState, mapActions, shouldRender)(RowToolbar)
