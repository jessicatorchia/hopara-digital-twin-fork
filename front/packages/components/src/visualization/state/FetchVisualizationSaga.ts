import {call, put, select, takeLatest} from '@redux-saga/core/effects'
import {getVisualization, listVisualizations, parseResponse, VisualizationResponse} from '../VisualizationRepository'
import ViewState, {getCenterOfTheWorldCoordinates} from '../../view-state/ViewState'
import actions from '../../state/Actions'
import {getType, isActionOf} from 'typesafe-actions'
import {ViewController} from '../../view-controller/ViewController'
import {FetchVisualizationSuccess} from './VisualizationActions'
import {Coordinates, Dimensions} from '@hopara/spatial'
import {Store} from '../../state/Store'
import Visualization, {VisualizationType} from '../Visualization'
import {SelectedFilters} from '../../filter/domain/SelectedFilters'
import {WorldFactory} from '../../world/WorldFactory'
import {isNil} from 'lodash/fp'
import {World} from '../../world/World'
import {MAIN_VIEW_ELM_ID} from '../../view/View'
import {VisualizationRouteParams} from '../VisualizationRouteProvider'
import {VisualizationEditStatus} from '../VisualizationEditStatus'
import {getRefreshAuthorization} from '../../auth/AuthSaga'
import {Authorization} from '@hopara/authorization'
import {BFF_VISUALIZATION_CACHE_KEY} from '@hopara/service-worker/src/bff/BFF'
import {takeEveryAndRestart} from '@hopara/state'
import {LayerFactory} from '../../layer/factory/LayerFactory'
import { getSelectedFilters } from '../../filter/DatasetFiltersFactory'
import { Columns } from '@hopara/dataset'

const getViewDimension = (): Dimensions => {
  const mainViewElement = document.getElementById(MAIN_VIEW_ELM_ID)
  if (!mainViewElement) return {width: 0, height: 0}
  const boundingRect = mainViewElement.getBoundingClientRect()
  return {
    width: boundingRect.width,
    height: boundingRect.height,
  }
}

const getViewState = (
  visualization: Visualization,
  initialViewState: any,
  world: World,
  params?: VisualizationRouteParams,
  oldViewState?: ViewState,
): ViewState => {
  if (oldViewState?.visualizationId === visualization.id) {
    return oldViewState
      .setInitialPosition(initialViewState?.position ?? oldViewState.initialPosition)
      .setZoomRange(initialViewState.zoomRange ?? oldViewState.zoomRange)
      .setZoomBehavior(initialViewState.zoomBehavior ?? oldViewState.zoomBehavior)
      .setContentBox(initialViewState.contentBoundingBox ?? oldViewState.contentBox)
  }
  return new ViewState({
    visualizationId: visualization.id,
    visualizationType: visualization.type,
    zoomRange: initialViewState.zoomRange,
    initialPosition: initialViewState?.position,
    zoom: isNil(params?.zoom) ? initialViewState?.position?.zoom : params?.zoom,
    bearing: isNil(params?.bearing) ? initialViewState?.position?.bearing : params?.bearing,
    coordinates: isNil(params?.coordinates) ? initialViewState.coordinates : new Coordinates(params?.coordinates),
    rotationOrbit: initialViewState?.position?.rotationOrbit ?? params?.rotationOrbit,
    rotationX: initialViewState?.position?.rotationX ?? params?.rotationX,
    zoomBehavior: initialViewState.zoomBehavior,
    dimensions: getViewDimension(),
    center: getCenterOfTheWorldCoordinates(world, getViewDimension()),
  }).setContentBox(initialViewState.contentBoundingBox)
}

const responseToAction = (response: VisualizationResponse, params?: VisualizationRouteParams & { scope?: string },
                          oldViewState?: ViewState): FetchVisualizationSuccess => {
  if (!response) return {} as FetchVisualizationSuccess

  const world = WorldFactory.createFromVisualization(response.visualization)
  const viewState = getViewState(response.visualization, response.initialViewState, world, params, oldViewState)
  const viewController = new ViewController({visualizationType: response.visualization.type})

  const layerFactory = new LayerFactory({
    queries: response.queries,
    zoomRange: response.initialViewState.zoomRange,
    layerDefaults: response.layerDefaults,
    scope: params?.visualizationScope ?? response.scope,
    visualizationType: response.visualization.type,
    layerTemplates: response.layerTemplates,
    visualizationCreatedVersion: response.visualization?.createdVersion,
    viewState,
  })

  return {
    ...response,
    scope: params?.visualizationScope ?? response.scope,
    world,
    viewState,
    viewController,
    filters: response.filters,
    selectedFilters: params?.selectedFilters ?? new SelectedFilters(),
    visualization: response.visualization,
    layers: layerFactory.createLayers(response.layers),
    floor: params?.floor,
    version: params?.version,
    fallbackVisualizationId: params?.fallbackVisualizationId,
    layerTemplates: response.layerTemplates,
  }
}

const getParams = (action: ReturnType<
  typeof actions.visualization.pageLoaded |
  typeof actions.visualizationHistory.checkoutVersion |
  typeof actions.visualization.editorDiscardChangesRequest |
  typeof actions.visualization.routeChanged |
  typeof actions.settings.pageLoaded |
  typeof actions.layerEditor.pageLoaded |
  typeof actions.objectEditor.pageLoaded |
  typeof actions.hoc.visualizationChanged
>, stateParams: { visualizationId?: string, fallbackVisualizationId?: string }): VisualizationRouteParams => {
  switch (action.type) {
    case getType(actions.visualization.pageLoaded):
    case getType(actions.settings.pageLoaded):
    case getType(actions.layerEditor.pageLoaded):
    case getType(actions.objectEditor.pageLoaded):
    case getType(actions.visualization.routeChanged):
      return action.payload.params
    case getType(actions.visualizationHistory.checkoutVersion):
      return {
        visualizationId: action.payload.visualizationId ?? stateParams.visualizationId,
        fallbackVisualizationId: stateParams.fallbackVisualizationId,
        version: action.payload.version,
      }
    case getType(actions.hoc.visualizationChanged):
      return {
        visualizationId: action.payload.visualizationId,
        fallbackVisualizationId: action.payload.fallbackVisualizationId,
        coordinates: action.payload.initialPosition ? new Coordinates(action.payload.initialPosition) : undefined,
        bearing: action.payload.initialPosition?.bearing,
        zoom: action.payload.initialPosition?.zoom,
      }
    default:
      return {
        visualizationId: stateParams.visualizationId,
        fallbackVisualizationId: stateParams.fallbackVisualizationId,
      }
  }
}

const getActionParams = (action: any, params: VisualizationRouteParams, visualizationType: VisualizationType): VisualizationRouteParams => {
  if (isActionOf(actions.visualization.routeChanged, action) &&
    action.payload.oldVisualizationType === VisualizationType.GEO &&
    action.payload.oldParams &&
    action.payload.oldVisualizationType === visualizationType) {
    return {
      ...params,
      coordinates: action.payload.oldParams.coordinates,
      zoom: action.payload.oldParams.zoom,
      bearing: action.payload.oldParams.bearing,
    }
  }

  return params
}

export function* fetchVisualization(action: ReturnType<
  typeof actions.visualization.pageLoaded |
  typeof actions.visualizationHistory.checkoutVersion |
  typeof actions.visualization.editorDiscardChangesRequest |
  typeof actions.visualization.routeChanged |
  typeof actions.settings.pageLoaded |
  typeof actions.layerEditor.pageLoaded |
  typeof actions.objectEditor.pageLoaded |
  typeof actions.hoc.visualizationChanged
>) {
  const stateVisualizationId: string | undefined = yield select((store: Store) => store.visualizationStore.visualization?.id)
  const fallbackVisualizationId: string | undefined = yield select((store: Store) => store.visualizationStore.fallbackVisualizationId)
  const visualizationScope: string | undefined = yield select((store: Store) => store.visualizationStore.visualization?.scope)
  const isDirty = yield select((store: Store) => store.visualizationStore.editStatus === VisualizationEditStatus.DIRTY)
  const params = getParams(action, {visualizationId: stateVisualizationId, fallbackVisualizationId})

  const isVisualizationReady: boolean = yield select((store: Store) => store.visualizationStore.isReady())
  const appVersion: string | undefined = yield select((store: Store) => store.visualizationStore.version)
  const isSwitchingVisualization = stateVisualizationId !== params.visualizationId
  const shouldIgnoreUpdate = isVisualizationReady && !isSwitchingVisualization && appVersion === params.version && !isDirty
  if (shouldIgnoreUpdate) return

  const authorization: Authorization = yield getRefreshAuthorization()
  let currentViewState: ViewState | undefined = undefined
  if (!isSwitchingVisualization) currentViewState = yield select((store: Store) => store.viewState)

  try {
    const visualizationResponse = yield call(getVisualization,
      params.visualizationId as string,
      params.fallbackVisualizationId,
      params.version,
      authorization,
      getSelectedFilters(params.selectedFilters, new Columns(), false),
    )

    const responseParams = getActionParams(action, params, visualizationResponse.visualization.type)

    yield put(actions.visualization.fetch.success(responseToAction(
      visualizationResponse,
      {
        ...responseParams,
        visualizationScope: responseParams.visualizationScope || visualizationScope,
        version: params.version,
      },
      currentViewState,
    )))
  } catch (e: any) {
    yield put(actions.visualization.fetch.failure({
      exception: e,
      toast: false,
    } as any))
  }
}

export function* refreshVisualization() {
  const visualizationId: string | undefined = yield select((store: Store) => store.visualizationStore.visualization?.id)
  const fallbackVisualizationId: string | undefined = yield select((store: Store) => store.visualizationStore.fallbackVisualizationId)
  const visualizationScope: string | undefined = yield select((store: Store) => store.visualizationStore.visualization?.scope)
  const authorization: Authorization = yield getRefreshAuthorization()

  try {
    const visualizationResponse = yield call(getVisualization,
      visualizationId as string,
      fallbackVisualizationId,
      undefined,
      authorization,
    )

    const viewState = yield select((store: Store) => store.viewState)
    yield put(actions.visualization.refreshed(responseToAction(visualizationResponse, {
      fallbackVisualizationId,
      visualizationScope,
    }, viewState)))
  } catch {
    // Ignore refresh errors
  }
}

const fetchVisualizations = function* () {
  const authorization: Authorization = yield getRefreshAuthorization()

  try {
    const visualizations = (yield call(listVisualizations, authorization)) as Visualization[]
    yield put(actions.visualization.list.success(visualizations))
  } catch (e: any) {
    yield put(actions.visualization.list.failure({exception: e}))
  }
}

function* refreshBroadcastedVisualization(action: ReturnType<typeof actions.hoc.broadcastUpdate>) {
  if (action.payload.cacheName !== BFF_VISUALIZATION_CACHE_KEY) return

  const currentVisualization: Visualization = yield select((store: Store) => store.visualizationStore.visualization)
  if (!currentVisualization || action.payload.response?.visualization?.id !== currentVisualization.id) return

  const currentTenant: string = yield select((store: Store) => store.auth.authorization.tenant)
  if (action.payload.tenant !== currentTenant) return

  const fallbackVisualizationId: string | undefined = yield select((store: Store) => store.visualizationStore.fallbackVisualizationId)
  const visualizationScope: string | undefined = yield select((store: Store) => store.visualizationStore.visualization?.scope)
  const visualizationResponse = parseResponse(action.payload.response)
  const viewState = yield select((store: Store) => store.viewState)
  yield put(actions.visualization.refreshed(responseToAction(visualizationResponse, {
    fallbackVisualizationId,
    visualizationScope,
  }, viewState)))
}


export const fetchVisualizationSagas = () => [
  takeLatest(actions.visualizationHistory.checkoutVersion, fetchVisualization),
  takeLatest(actions.visualization.editorDiscardChangesRequest, fetchVisualization),
  takeLatest(actions.visualization.pageLoaded, fetchVisualization),
  takeEveryAndRestart(actions.visualization.routeChanged, fetchVisualization),
  takeLatest(actions.settings.pageLoaded, fetchVisualization),
  takeLatest(actions.layerEditor.pageLoaded, fetchVisualization),
  takeLatest(actions.objectEditor.pageLoaded, fetchVisualization),
  takeLatest(actions.hoc.visualizationChanged, fetchVisualization),
  takeLatest(actions.settings.pageLoaded, fetchVisualizations),
  takeLatest(actions.layerEditor.pageLoaded, fetchVisualizations),
  takeLatest(actions.visualization.changed, refreshVisualization),
  takeLatest(actions.hoc.broadcastUpdate, refreshBroadcastedVisualization),
]

