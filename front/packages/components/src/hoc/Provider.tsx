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

// We set here, before everything, to allow debug config in react config
const queryString = QueryStringParser.parse(window.location.search)
if (queryString.debug === 'true') {
  Debug.enable()
} else if (queryString.debug === 'false') {
  Debug.disable()
  window._hoparaDisableDebug = () => Debug.disable()
}

if (Debug.isDebugging()) {
  window._hoparaStore = HoparaStore
  window._hoparaConfig = Config
}

window._hoparaEnableDebug = () => {
  Debug.enable()
  logVisualizationInfo()
  window._hoparaStore = HoparaStore
  window._hoparaConfig = Config
  window._hoparaDisableDebug = () => Debug.disable()
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
