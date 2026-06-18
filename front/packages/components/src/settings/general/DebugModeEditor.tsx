import React from 'react'
import {PureComponent} from '@hopara/design-system'
import {PanelField} from '@hopara/design-system/src/panel/PanelField'
import {PanelCard} from '@hopara/design-system/src/panel/PanelCard'
import {i18n} from '@hopara/i18n'
import {Box, Switch} from '@mui/material'
import {Debug} from '@hopara/internals'

interface State {
  enabled: boolean
}

export class DebugModeEditor extends PureComponent<{}, State> {
  state: State = {
    enabled: Debug.isDebugging()
  }

  onChange = (enabled: boolean) => {
    if (enabled) {
      Debug.enable()
    } else {
      Debug.disable()
    }

    this.setState({enabled})
  }

  render() {
    return (
      <PanelCard>
        <PanelField
          title={i18n('DEBUG_MODE')}
          layout="toggle"
          helperText={i18n('DEBUG_MODE_HELPER_TEXT')}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'right',
            }}
          >
            <Switch
              checked={this.state.enabled}
              onChange={(event) => this.onChange(event.target.checked)}
            />
          </Box>
        </PanelField>
      </PanelCard>
    )
  }
}

export const DebugModeEditorContainer = DebugModeEditor
