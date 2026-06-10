import {all, call, CallEffect, debounce, put, select, takeEvery, takeLatest, throttle} from '@redux-saga/core/effects'
import actions from '../state/Actions'
import {fetchValues} from '../filter/FilterRepository'
import {Store} from '../state/Store'
import {Layers} from '../layer/Layers'
import ViewState from '../view-state/ViewState'
import {Authorization} from '@hopara/authorization'
import {RowsetStore} from '../rowset/RowsetStore'
import {isActionOf} from 'typesafe-actions'
import {Rowset} from '../rowset/Rowset'
import {FloorStore} from './FloorStore'
import {isEmpty} from 'lodash'
import {Floors} from './Floors'
import {getRefreshAuthorization} from '../auth/AuthSaga'
import {takeEveryDepends} from '@hopara/state'
import {takeBoth} from '@hopara/state'
import { FilterType, getDatasetFilters } from '../rowset/DatasetFiltersService'
import { getFloorsFetchData } from './FloorFetchController'
import { FetchController, FetchControllerToken } from '../rowset/fetch/FetchController'
import {container} from 'tsyringe'
import Visualization from '../visualization/Visualization'
import QueryStore from '../query/QueryStore'

function* getFilters(rowset: Rowset, viewState: ViewState) {
  const isOnObjectEditor = yield select((store: Store) => store.visualizationStore.isOnObjectEditor())

  const queryStore:QueryStore = yield select((store: Store) => store.queryStore)
  const positionQuery = queryStore.queries.findQuery(rowset.getPositionQueryKey())

  const visualization: Visualization = yield select((store: Store) => store.visualizationStore.visualization)
  const fetchController = container.resolve<FetchController>(FetchControllerToken)
  const fetchBox = fetchController.getFetchBox(positionQuery, visualization.type, visualization.bleedFactor, viewState.getVisibleWorld())

  const filterTypes = [FilterType.SELECTED]
  if (!isOnObjectEditor && fetchBox) {
    filterTypes.push(FilterType.BOX)
  }

  return yield getDatasetFilters(filterTypes, rowset, fetchBox)
}

function* getDataFloors() {
  const viewState: ViewState = yield select((store: Store) => store.viewState)
  if (!viewState) {
    return new Floors()
  }

  const rowsetStore: RowsetStore = yield select((store: Store) => store.rowsetStore)
  const layers: Layers = yield select((store: Store) => store.layerStore.layers)
  const fetchDataList = getFloorsFetchData(layers, rowsetStore.getRowsets(), viewState)
  if (isEmpty(fetchDataList)) {
    return new Floors()
  }

  const authorization: Authorization = yield getRefreshAuthorization()
  const floorRequestPromises: CallEffect[] = []

  for (const fetchData of fetchDataList) {
    const rowset = fetchData.rowset
    const filters = yield getFilters(rowset, fetchData.viewState)
    floorRequestPromises.push(call(
      fetchValues,
      rowset.getPositionData(),
      rowset.getFloorField()!,
      undefined,
      filters,
      authorization,
      true,
    ))
  }

  const responses = yield all(floorRequestPromises)
  return Floors.fromStringArray(responses.flat() ?? [])
}

function* refreshFloors(action: any) {
  const visualization: Visualization = yield select((store: Store) => store.visualizationStore.visualization)
  if ( !visualization ) return
  if ( !(visualization.isGeo() || visualization.isWhiteboard()) || (isActionOf([actions.hoc.forceRefresh], action) )) {
    return yield put(actions.floor.checked())
  }

  try {
    const dataFloors = yield* getDataFloors()
    const floorStore: FloorStore = yield select((store: Store) => store.floorStore)

    // Otherwise it will erase the floorplan list if there's no need to fetch again (e.g. smart load false)
    if (isEmpty(dataFloors) && floorStore.hasCurrent()) {
      return yield put(actions.floor.checked())
    }

    yield put(actions.floor.floorFetched({dataFloors, visualizationFloors: floorStore.visualizationFloors}))
  } catch {
    yield put(actions.floor.checked())
  }
}

function* checkFloorChange() {
  const floors: FloorStore = yield select((store: Store) => store.floorStore)

  if (floors.hasChanged()) {
    return yield put(actions.floor.changed({floor: floors.getCurrent()}))
  }
  return yield put(actions.floor.checked())
}

export const floorSagas = () => [
  takeEvery(actions.floor.floorFetched, checkFloorChange),
  takeLatest(actions.visualization.pageLoaded, checkFloorChange),
  takeLatest(actions.settings.pageLoaded, checkFloorChange),
  takeLatest(actions.layerEditor.pageLoaded, checkFloorChange),
  takeLatest(actions.object.click, checkFloorChange),
  takeLatest(actions.navigation.searchRowClicked, checkFloorChange),
  takeLatest(actions.object.navigateTo, checkFloorChange),
  takeLatest(actions.object.navigateToInitialRow, checkFloorChange),
  takeLatest(actions.details.zoomRequested, refreshFloors),
  takeLatest(actions.object.navigateTo, refreshFloors),
  takeLatest(actions.object.navigateToInitialRow, refreshFloors),
  takeLatest(actions.object.panTo, refreshFloors),
  takeLatest(actions.object.click, refreshFloors),
  takeLatest(actions.navigation.searchRowClicked, refreshFloors),
  takeLatest(actions.layer.selected, refreshFloors),
  takeLatest(actions.navigation.goToPlace, refreshFloors),
  takeLatest(actions.navigation.initialPositionRequested, refreshFloors),
  takeLatest(actions.view.viewDragEnd, refreshFloors),
  takeLatest(actions.layer.queryChanged, refreshFloors),
  takeLatest(actions.layer.typeChanged, refreshFloors),
  takeLatest(actions.layer.positionTypeChanged, refreshFloors),
  takeLatest(actions.layer.positionEncodingChanged, refreshFloors),
  takeLatest(actions.layer.transformChanged, refreshFloors),
  takeLatest(actions.hoc.filterChanged, refreshFloors),
  takeLatest(actions.hoc.loaderChanged, refreshFloors),
  takeLatest(actions.visualization.pageLoaded, refreshFloors),
  takeLatest(actions.settings.pageLoaded, refreshFloors),
  takeLatest(actions.layerEditor.pageLoaded, refreshFloors),
  takeBoth(actions.visualization.fetch.success, actions.view.viewLoaded, refreshFloors),
  takeEveryDepends(actions.visualization.refreshed, actions.view.viewLoaded, refreshFloors),
  debounce(3000, actions.layer.codeChanged, refreshFloors),
  debounce(100, actions.navigation.zoomInRequested, refreshFloors),
  debounce(100, actions.navigation.zoomOutRequested, refreshFloors),
  debounce(500, actions.hoc.forceRefresh, refreshFloors),
  throttle(500, actions.view.viewZooming, refreshFloors),
]

