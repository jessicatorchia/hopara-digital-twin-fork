import actions from '../state/Actions'
import { takeLatestPerKey } from '@hopara/state'
import { Authorization } from '@hopara/authorization'
import { Store } from '../state/Store'
import { Layers } from '../layer/Layers'
import { ImageRepository } from './ImageRepository'
import { IsometricMethod } from '../resource/ResourceRepository'
import { toastInfo, toastSuccess } from '@hopara/design-system/src/toast/Toast'
import { i18n } from '@hopara/i18n'
import { Bounds, PlainBounds, RowCoordinates } from '@hopara/spatial'
import { createUploadFunctionChannel } from '../resource/ResourceSaga'
import { call, put, select, take, takeEvery } from '@redux-saga/core/effects'
import ViewState from '../view-state/ViewState'
import { getRefreshAuthorization } from '../auth/AuthSaga'
import { Layer } from '../layer/Layer'
import { Rowset } from '../rowset/Rowset'
import { Row } from '@hopara/dataset'
import { PlaceTransform } from '../transform/PlaceTransform'
import { getInnerBoundsPercentages } from './ImageShape'
import { OrthographicViewport } from '../view/deck/OrthographicViewport'
import WebMercatorViewport from '../view/deck/WebMercatorViewport'
import { RowSelection } from '../view-layer/deck/interaction/RowSelection'
import { isActionOf } from 'typesafe-actions'
import { ImageRotation } from './ImageRotation'

function* uploadImageFile(action: ReturnType<typeof actions.image.upload.request>) {
  const authorization: Authorization = yield getRefreshAuthorization()
  const layers: Layers = yield select((store: Store): Layers => store.layerStore.layers)

  try {
    yield put(actions.image.uploadProgress({
      layerId: action.payload.layerId,
      resourceId: action.payload.resourceId,
      library: action.payload.library,
      progress: 0,
    }))
    const channel = yield call(
      createUploadFunctionChannel,
      ImageRepository.save,
      action.payload.resourceId,
      action.payload.library,
      action.payload.file,
      authorization)
    while (true) {
      const { progress = 0, err, dimensions, version, shape, success, processing } = yield take(channel)
      if (err) {
        yield put(actions.image.upload.failure({
          reason: i18n('AN_ERROR_OCCURRED_WHILE_UPLOADING_THE_IMAGE_FILE'),
          layerId: action.payload.layerId,
          resourceId: action.payload.resourceId,
          library: action.payload.library,
          exception: err
        }))
        return
      } else if (success) {
        const layer = layers.getById(action.payload.layerId)
        if (!layer) return

        if (processing) toastInfo(i18n('IMAGE_UPLOAD_SUCCESSFUL_BUT_STILL_PROCESSING_MESSAGE'))

        yield put(actions.image.upload.success({
          library: action.payload.library,
          resourceId: action.payload.resourceId,
          layerId: action.payload.layerId,
          rowsetId: action.payload.rowsetId,
          row: action.payload.row,
          dimensions: { width: dimensions.width || 1, height: dimensions.height || 1 },
          shape,
          version
        }))

        return
      }
      yield put(actions.image.uploadProgress({
        layerId: action.payload.layerId,
        resourceId: action.payload.resourceId,
        library: action.payload.library,
        progress
      }))
    }
  } catch (error: any) {
    yield put(actions.image.upload.failure({
      reason: i18n('AN_ERROR_OCCURRED_WHILE_UPLOADING_THE_IMAGE_FILE'),
      layerId: action.payload.layerId,
      resourceId: action.payload.resourceId,
      library: action.payload.library,
      exception: error
    }))
  }
}

function* restoreImage(action: ReturnType<typeof actions.image.restore.request>) {
  const authorization: Authorization = yield getRefreshAuthorization()
  const layer: Layer = yield select((store: Store): Layer => store.layerStore.layers.getById(action.payload.layerId)!)
  const library = layer.encoding?.image?.scope!
  const resourceId = layer.encoding?.image?.getId(action.payload.row)

  try {
    const res = yield call(
      ImageRepository.restoreVersion,
      resourceId,
      library,
      action.payload.version as number,
      authorization
    )
    const dimensions = res.data.dimensions.width === null ? { width: 1, height: 1 } : res.data.dimensions
    toastSuccess(i18n('IMAGE_RESTORED_SUCCESSFULLY'))
    yield put(actions.image.restore.success({
      layerId: action.payload.layerId,
      rowsetId: action.payload.rowsetId,
      row: action.payload.row,
      dimensions,
      resourceId,
      library,
      version: res.data.version,
      shape: res.shape
    }))
  } catch (e: any) {
    yield put(actions.image.restore.failure({ exception: e }))
  }
}

function* undoImage(action: ReturnType<typeof actions.rowHistory.imageUndoRequested>) {
  const authorization: Authorization = yield getRefreshAuthorization()
  const layer: Layer = yield select((store: Store): Layer => store.layerStore.layers.getById(action.payload.layerId)!)
  const library = layer.encoding?.image?.scope
  const resourceId = layer.encoding?.image?.getId(action.payload.row)

  try {
    const res = yield call(
      ImageRepository.rollback,
      resourceId as string,
      library as string,
      action.payload.version,
      authorization
    )

    yield put(actions.image.undo.success({
      layerId: action.payload.layerId,
      rowsetId: action.payload.rowsetId,
      row: action.payload.row,
      dimensions: res.data.dimensions,
      resourceId,
      library,
      version: res.data.version,
      shape: res.shape
    }))
  } catch (e: any) {
    yield put(actions.image.undo.failure({ exception: e }))
  }
}

const getRowCoordinates = (rowCoordinates: RowCoordinates, layer: Layer, viewState: ViewState): RowCoordinates => {
  if (!rowCoordinates.hasGeometry() && layer.hasPlaceTransform()) {
    const geometry = (layer.data.transform as PlaceTransform).getGeometry(viewState)
    return RowCoordinates.fromGeometry(geometry)
  }

  return rowCoordinates
}

export function* saveImageBounds(action: ReturnType<
  typeof actions.image.upload.success |
  typeof actions.image.restore.success |
  typeof actions.image.undo.success |
  typeof actions.image.crop.success |
  typeof actions.image.generateIsometric.success |
  typeof actions.image.generateIsometricWireframe.success
>) {
  const viewState: ViewState = yield select((store: Store) => store.viewState)
  const viewport = viewState.getViewport()
  const isOrthographicViewport = viewState.isOrthographicViewport(viewport)
  const layers: Layers = yield select((store: Store): Layers => store.layerStore.layers)
  const layer = layers.getById(action.payload.layerId)
  const rowset: Rowset = yield select((store: Store) => action.payload.rowsetId ? store.rowsetStore.getRowset(action.payload.rowsetId) : undefined)
  const dimensions = action.payload.dimensions

  const rowCoordinates = getRowCoordinates(action.payload.row.getCoordinates(), layer!, viewState)
  if (!rowset || !rowCoordinates.hasGeometry()) {
    return yield put(actions.image.saveImageBoundsError({
      reason: i18n('ERROR_SAVING_IMAGE_BOUNDS'),
      exception: new Error('Missing required data')
    }))
  }

  const bounds = Bounds.fromGeometry(rowCoordinates.getGeometryLike() as PlainBounds, { orthographic: isOrthographicViewport })
  const keepSameWidth = !(action.payload.cascadeToSameKey === false && isActionOf([actions.image.crop.success], action))
  const boundsPolygon = bounds.extrudeGeometry(dimensions.width || 1, dimensions.height || 1, keepSameWidth).toPolygon()
  const detailedGeometry = action.payload.shape ? bounds.projectGeometry(action.payload.shape) : undefined

  const actionPayload = {
    layerId: action.payload.layerId!,
    rowsetId: rowset.getId(),
    row: action.payload.row,
    rowCoordinates: new RowCoordinates({ geometry: boundsPolygon, detailedGeometry })
  }

  yield put(actions.image.boundsCreated(actionPayload))

  if (action.payload.cascadeToSameKey !== false) {
    const imageKey = layer?.encoding.image?.field
    const sameImageKeyRows = rowset.rows.filter((row: Row) => {
      return row.getValue(imageKey) === action.payload.row.getValue(imageKey) &&
             row.getId() !== action.payload.row.getId()
    })

    for (const row of sameImageKeyRows) {
      yield put({
        ...action,
        payload: {
          ...action.payload,
          cascadeToSameKey: false,
          row 
        }
      })
    }
  }
}

function* loadImageHistory(action: ReturnType<
  typeof actions.details.imageHistoryOpenClicked |
  typeof actions.image.upload.success |
  typeof actions.image.restore.success |
  typeof actions.image.undo.success |
  typeof actions.image.generateIsometric.success |
  typeof actions.image.generateIsometricWireframe.success
>) {
  const isHistoryActive: boolean = yield select((store: Store) => !!store.imageHistory.layerId)
  if (!isHistoryActive) return

  try {
    const authorization: Authorization = yield getRefreshAuthorization()
    const items = yield call(ImageRepository.loadHistory, action.payload.resourceId as string, action.payload.library as string, authorization)
    yield put(actions.image.history.success(items))
  } catch (error: any) {
    yield put(actions.image.history.failure({ exception: error }))
  }
}

const getCropPercentages = (row: Row, cropShape: any[], imageRatio: number | undefined, viewport: OrthographicViewport | WebMercatorViewport) => {
  return getInnerBoundsPercentages(
    row.getCoordinates().getGeometryLike(),
    cropShape,
    imageRatio,
    viewport
  )
}

function* cropImage() {
  const layer: Layer = yield select((store: Store) => store.layerStore.layers.getById(store.viewLayers.crop.layerId))
  const rowset: Rowset = yield select((store: Store) => store.rowsetStore.getRowset(layer.getRowsetId()))
  const authorization: Authorization = yield getRefreshAuthorization()
  const row: Row = yield select((store: Store) => rowset.getRow(store.viewLayers.crop.row._id))
  const cropBounds = yield select((store: Store) => store.viewLayers.crop.bounds)
  const viewport = yield select((store: Store) => store.viewState?.viewport)
  const resourceId = layer.encoding?.image?.getId(row)

  try {
    const imageMetadata = yield call(
      ImageRepository.getMetadata as any,
      layer.encoding!.image!.getId(row),
      layer.encoding!.image!.scope,
      authorization
    )

    const ratio = imageMetadata.width && imageMetadata.height ? imageMetadata.width / imageMetadata.height : undefined
    const cropPercentages = getCropPercentages(row!, cropBounds, ratio, viewport)

    const res = yield call(
      ImageRepository.crop,
      layer.encoding!.image!.getId(row),
      layer.encoding!.image!.scope,
      cropPercentages,
      authorization
    )

    // usar crop percentages para calcular todos os geometries 
    yield put(actions.image.crop.success({
      imageId: layer.encoding!.image!.getId(row),
      layerId: layer.getId(),
      library: layer.encoding!.image!.scope!,
      resourceId,
      rowsetId: rowset.getId(),
      row: row.updateCoordinates(new RowCoordinates({ geometry: cropBounds })),
      dimensions: res.data.dimensions,
      version: res.data.version,
      shape: res.data.shape
    }))
  } catch (e: any) {
    yield put(actions.image.crop.failure({ reason: i18n('ERROR_CROPPING_IMAGE'), exception: e }))
  }
}

function* generateIsometricImage(action: ReturnType<typeof actions.rowToolbar.generateIsometricClicked>) {
  try {
    const authorization: Authorization = yield getRefreshAuthorization()

    const imageMetadata = yield call(
      ImageRepository.generateIsometric,
      action.payload.resourceId,
      action.payload.library,
      IsometricMethod.REALISTIC,
      authorization
    )

    yield put(actions.image.generateIsometric.success({
      library: action.payload.library,
      imageId: action.payload.resourceId,
      layerId: action.payload.layerId,
      rowsetId: action.payload.rowsetId,
      resourceId: action.payload.resourceId,
      row: action.payload.row,
      dimensions: imageMetadata.dimensions,
      version: imageMetadata.version,
      shape: imageMetadata.shape,
      canRotate: true
    }))

    toastSuccess(i18n('ISOMETRIC_GENERATION_STARTED'))
  } catch (e: any) {
    yield put(actions.image.generateIsometric.failure({
      reason: i18n('ERROR_GENERATING_ISOMETRIC_IMAGE'),
      resourceId: action.payload.resourceId,
      library: action.payload.library,
      exception: e
    }))
  }
}

function* generateIsometricWireframeImage(action: ReturnType<typeof actions.rowToolbar.generateIsometricWireframeClicked>) {
  try {
    const authorization: Authorization = yield getRefreshAuthorization()

    const imageMetadata = yield call(
      ImageRepository.generateIsometric,
      action.payload.resourceId,
      action.payload.library,
      IsometricMethod.WIREFRAME,
      authorization
    )

    toastSuccess(i18n('ISOMETRIC_WIREFRAME_GENERATION_STARTED'))

    yield put(actions.image.generateIsometricWireframe.success({
      library: action.payload.library,
      imageId: action.payload.resourceId,
      layerId: action.payload.layerId,
      rowsetId: action.payload.rowsetId,
      row: action.payload.row,
      dimensions: imageMetadata.dimensions,
      version: imageMetadata.version,
      resourceId: action.payload.resourceId,
      shape: imageMetadata.shape
    }))
  } catch (e: any) {
    yield put(actions.image.generateIsometricWireframe.failure({
      reason: i18n('ERROR_GENERATING_ISOMETRIC_WIREFRAME_IMAGE'),
      library: action.payload.library,
      resourceId: action.payload.resourceId,
      exception: e
    }))
  }
}

function* updateImageMetadata() {
  const selectedRow: RowSelection = yield select((store: Store) => store.viewLayers.rowSelection)
  const layerId = selectedRow?.layerId
  if (!layerId) return
  const layer: Layer = yield select((store: Store) => store.layerStore.layers.getById(layerId))
  if (!layer || !layer.encoding?.image) return
  
  const rowset: Rowset = yield select((store: Store) => store.rowsetStore.getRowset(layer.getRowsetId()))
  const row = rowset.getRow(selectedRow.rowId)
  const authorization: Authorization = yield getRefreshAuthorization()
  const imageMetadata: { allow_rotation?: boolean, placeholder?: boolean } = yield call(
    ImageRepository.getMetadata as any,
    layer.encoding!.image!.getId(row),
    layer.encoding!.image!.scope,
    authorization
  )
  yield put(actions.rowToolbar.isometricImageLoaded({
    isometricImageLoaded: !!imageMetadata.allow_rotation
  }))

  yield put(actions.rowToolbar.imageLoaded({
    imageLoaded: !(imageMetadata.placeholder === true)
  }))
}

function* onRotateRequested() {
  const rowSelection: RowSelection = yield select((store: Store) => store.viewLayers.rowSelection)
  const row: Row = yield select((store: Store) => store.rowsetStore.getRowset(rowSelection.rowsetId)?.getRow(rowSelection.rowId))
  const layer: Layer = yield select((store: Store) => store.layerStore.layers.getById(rowSelection.layerId))
  const imageRotation = new ImageRotation(Number(layer.encoding?.image?.getView(row)))

  yield put(actions.image.rotateRequested({
    view: imageRotation.getRotatedAngle(),
    rowId: rowSelection.rowId,
    layerId: rowSelection.layerId,
    rowsetId: rowSelection.rowsetId
  }))
}

export const imageSagas = () => [
  takeEvery(actions.image.upload.request, uploadImageFile),
  takeEvery(actions.details.imageHistoryOpenClicked, loadImageHistory),
  takeEvery(actions.image.restore.success, loadImageHistory),
  takeEvery(actions.image.undo.success, loadImageHistory),
  takeEvery(actions.image.upload.success, loadImageHistory),
  takeLatestPerKey(actions.image.upload.success, saveImageBounds, (action) => action.payload.row._id),
  takeEvery(actions.image.restore.request, restoreImage),
  takeEvery(actions.rowHistory.imageUndoRequested, undoImage),
  takeEvery(actions.image.restore.success, saveImageBounds),
  takeEvery(actions.image.undo.success, saveImageBounds),
  takeEvery(actions.image.crop.success, saveImageBounds),
  takeEvery(actions.image.generateIsometric.success, loadImageHistory),
  takeEvery(actions.image.generateIsometricWireframe.success, loadImageHistory),
  takeLatestPerKey(actions.image.generateIsometric.success, saveImageBounds, (action) => action.payload.row._id),
  takeLatestPerKey(actions.image.generateIsometricWireframe.success, saveImageBounds, (action) => action.payload.row._id),
  takeEvery(actions.viewLayer.cropApplyClicked, cropImage),
  takeEvery(actions.rowToolbar.generateIsometricClicked, generateIsometricImage),
  takeEvery(actions.rowToolbar.generateIsometricWireframeClicked, generateIsometricWireframeImage),
  takeEvery(actions.image.generateIsometric.success, saveImageBounds),
  takeEvery(actions.image.generateIsometricWireframe.success, saveImageBounds),
  takeEvery(actions.rowToolbar.onLoad, updateImageMetadata),
  takeEvery(actions.image.upload.success, updateImageMetadata),
  takeEvery(actions.image.restore.success, updateImageMetadata),
  takeEvery(actions.resource.generateProgress, updateImageMetadata),
  takeEvery(actions.rowToolbar.rotateRequested, onRotateRequested),
]
