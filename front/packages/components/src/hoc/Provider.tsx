import React from 'react'
import {Provider} from 'react-redux'
import {Debug, Internals, Logger} from '@hopara/internals'
import QueryStringParser from 'query-string'
import getStore from '../state/Store'
import {Config} from '@hopara/config'
import {PureComponent} from '@hopara/design-system/src/component/PureComponent'
import {ToastContainer} from '@hopara/design-system/src/toast/ToastContainer'
import {logVisualizationInfo} from '../log/Log'
import ThemeProvider from './ThemeProvider'
import { broadcastListener } from '@hopara/service-worker/src/Broadcast'
import actions from './HocActions'
import {overrideConsole} from './Log'

const window: any = global
overrideConsole(window)

Internals.init(['test', 'animate', 'advanced', 'navigationControls'])
export const HoparaStore = getStore()

const DEBUG_MODE_STORAGE_KEY = 'hopara.debugMode'

function persistDebugMode(enabled: boolean): void {
  try {
    window.localStorage?.setItem(DEBUG_MODE_STORAGE_KEY, String(enabled))
  } catch {
    // Ignore localStorage failures (private mode / blocked storage).
  }
}

function getStoredDebugMode(): boolean {
  try {
    return window.localStorage?.getItem(DEBUG_MODE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function applyDebugWindowBindings(): void {
  window._hoparaStore = HoparaStore
  window._hoparaConfig = Config
}

function clearDebugWindowBindings(): void {
  delete window._hoparaStore
  delete window._hoparaConfig
}

function enableDebugMode({persist = false}: {persist?: boolean} = {}): void {
  Debug.enable()
  logVisualizationInfo()
  applyDebugWindowBindings()
  if (persist) persistDebugMode(true)
}

function disableDebugMode({persist = false}: {persist?: boolean} = {}): void {
  Debug.disable()
  clearDebugWindowBindings()
  if (persist) persistDebugMode(false)
}

// We set here, before everything, to allow debug config in react config
const queryString = QueryStringParser.parse(window.location.search)
if (queryString.debug === 'true') {
  enableDebugMode()
} else if (queryString.debug === 'false') {
  disableDebugMode()
} else if (getStoredDebugMode()) {
  enableDebugMode()
} else {
  disableDebugMode()
}

window._hoparaEnableDebug = () => {
  enableDebugMode({persist: true})
}

window._hoparaDisableDebug = () => {
  disableDebugMode({persist: true})
}

interface Props extends React.PropsWithChildren {
}

class HoparaProvider extends PureComponent<Props> {
  listenToSWBroadcast() {
    broadcastListener((payload) => {
      HoparaStore.dispatch(actions.broadcastUpdate(payload))
    })
  }

  componentDidMount() {
    logVisualizationInfo()
    this.listenToSWBroadcast()
  }

  componentDidCatch(error) {
    Logger.error(error)
  }

  render() {
    return (
      <Provider store={HoparaStore}>
        <ThemeProvider>
          <ToastContainer />
          {this.props.children}
        </ThemeProvider>
      </Provider>
    )
  }
}

export default HoparaProvider
