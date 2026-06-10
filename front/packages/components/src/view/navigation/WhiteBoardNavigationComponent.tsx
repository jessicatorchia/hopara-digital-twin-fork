import React from 'react'
import { InitialPositionButton } from './buttons/InitialPositionButton'
import { ZoomButton } from './buttons/ZoomButton'
import { ActionProps, StateProps } from './NavigationComponent'
import { FullScreenButton } from './buttons/FullScreenButton'
import { PureComponent } from '@hopara/design-system'
import { ActionButtonsContainer } from './buttons/ActionButtonsContainer'
import { AutoNavigateButton } from './buttons/AutoNavigateButton'
import { SearchButtonContainer } from './buttons/SearchButtonContainer'
import { ElevatorContainer } from './buttons/ElevatorContainer'

export class WhiteBoardNavigationComponent extends PureComponent<StateProps & ActionProps> {
  render() {
    return (
      <>
        <FullScreenButton
          onFullScreenClick={this.props.onFullScreenClick}
          fullScreen={this.props.fullScreen}
        />
        <SearchButtonContainer />
        {this.props.showZoomButtons &&
          <ZoomButton
            onZoomInClick={this.props.onZoomInClick}
            onZoomOutClick={this.props.onZoomOutClick}
          />
        }
        <InitialPositionButton onInitialPositionClick={this.props.onInitialPositionClick}/>
        {this.props.showAutoNavigateButton &&
          <AutoNavigateButton active={this.props.isAutoNavigationEnabled} onClick={this.props.onAutoNavigateClick} />
        }
        <ElevatorContainer />
        <ActionButtonsContainer/>
      </>
    )
  }
}
