import {PureComponent} from '@hopara/design-system'
import {PanelTitleBar} from '@hopara/design-system/src/panel/PanelTitleBar'
import {i18n} from '@hopara/i18n'
import {PanelCards} from '@hopara/design-system/src/panel/PanelCard'
import {RefreshEditorContainer} from './RefreshEditor'
import {InitialPositionEditorContainer} from './InitialPositionEditorContainer'
import {AutoNavigationEditorContainer} from './auto-navigation/AutoNavigationEditorContainer'
import {SettingsMenuItemId} from '../SettingsMenu'
import actions from '../../state/Actions'
import {connect} from '@hopara/state'
import {Dispatch} from '@reduxjs/toolkit'
import {MoreButton} from '@hopara/design-system/src/buttons/MoreButton'
import {SubPanel, SubPanelWrapper} from '@hopara/design-system/src/panel/SubPanel'
import {DebugModeEditorContainer} from './DebugModeEditor'

interface ActionProps {
  onAdvancedModeClick: (enabled: boolean) => void
}

type Props = ActionProps

export class GeneralDefaultPanel extends PureComponent<Props> {
  render() {
    return (
      <SubPanelWrapper>
        <SubPanel
          header={<PanelTitleBar
            title={i18n('GENERAL')}
            buttons={[<MoreButton
              key="more"
              menuItems={[{label: i18n('ADVANCED_MODE'), onClick: () => this.props.onAdvancedModeClick(true)}]}
            />]}
          />}
        >
          <PanelCards>
            <InitialPositionEditorContainer/>
            <AutoNavigationEditorContainer/>
            <RefreshEditorContainer/>
            <DebugModeEditorContainer/>
          </PanelCards>
        </SubPanel>
      </SubPanelWrapper>
    )
  }
}

function mapActions(dispatch: Dispatch): ActionProps {
  return {
    onAdvancedModeClick: (enabled = false) => {
      dispatch(actions.visualization.advancedModeClicked({area: SettingsMenuItemId.GENERAL, enabled}))
    },
  }
}

export const GeneralDefaultPanelContainer = connect<{}, ActionProps>(() => ({}), mapActions)(GeneralDefaultPanel)
