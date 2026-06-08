import React, {CSSProperties, RefObject} from 'react'
import {PureComponent} from '@hopara/design-system'
import {ViewLayerEditingMode} from '../view-layer/ViewLayerStore'
import {RowSavedStatusComponent} from './RowSavedStatusComponent'
import {RowSavedStatus} from './RowHistoryStore'
import {i18n} from '@hopara/i18n'
import Visualization from '../visualization/Visualization'
import {Row, Rows} from '@hopara/dataset'
import {Layer} from '../layer/Layer'
import {CanvasNavigationBar} from '@hopara/design-system/src/navigation/CanvasNavigationBar'
import {CanvasNavigationButtonGroup} from '@hopara/design-system/src/navigation/CanvasNavigationButtonGroup'
import {CanvasNavigationButton} from '@hopara/design-system/src/navigation/CanvasNavigationButton'
import {CanvasNavigationDivider} from '@hopara/design-system/src/navigation/CanvasNavigationDivider'
import {UploadButton, UploadStatus} from '@hopara/design-system/src/buttons/UploadButton'
import {imageMimeTypes, modelMimeTypes, modelOnlyMimeTypes} from '@hopara/resource'
import {Box} from '@mui/material'
import {acceleratorForPlatform} from '@hopara/design-system/src/shortcuts'
import {Icon} from '@hopara/design-system/src/icons/Icon'
import {PillButton} from '@hopara/design-system/src/buttons/PillButton'
import {styled} from '@mui/material/styles'
import {LayerType} from '../layer/LayerType'
import {Config} from '@hopara/config'
import {HoparaCloudBadge} from '@hopara/design-system/src/branding/HoparaCloudBadge'

const cloudFeaturesEnabled = Config.getValueAsBoolean('CLOUD_FEATURES_ENABLED')

const CloudFeatureLabel = ({featureName}: {featureName: string}) => (
  <Box sx={{textAlign: 'center'}}>
    <div>{featureName}</div>
    <Box sx={{opacity: 0.7, fontSize: 11, marginTop: '2px'}}>
      <HoparaCloudBadge />
    </Box>
  </Box>
)

export interface StateProps {
  hasUndoRow?: boolean;
  rowSavedStatus?: RowSavedStatus;
  selectedViewLayerEditMode: ViewLayerEditingMode;
  layerType: LayerType;
  unplaceVisible: boolean;
  undoVisible: boolean;
  visualization: Visualization;
  rowsetId?: string;
  layer?: Layer;
  row: Row | undefined;
  fullVersion?: boolean;
  progress?: number;
  status?: UploadStatus;
  isCropMode?: boolean;
  isCropping?: boolean;
  canCrop?: boolean;
  isCropLoading?: boolean;
  canUpdateOrder?: boolean;
  visible?: boolean;
  canUpload?: boolean;
  canFitToImage: boolean;
  canFitToBuilding: boolean;
  isFitting: boolean;
  screenCoordinates: number[];
  isGeneratingImage?: boolean;
  allowRotation?: boolean;
  allowImageEdit?: boolean;
  hasViewField?: boolean;
  rows: Rows;
}

export interface ActionProps {
  onUndoClick: () => void;
  onViewLayerEditModeClick: (mode: ViewLayerEditingMode) => void;
  onUnplaceClick: () => void;
  onReplaceImageClick: (imageFile: File) => void;
  onReplaceModelClick: (modeFile: File) => void;
  onShowImageHistoryClick: () => void;
  onShowModelHistoryClick: () => void;
  onCropCancel: () => void;
  onCropApply: () => void;
  onBringToFrontClick: () => void;
  onSendToBackClick: () => void;
  onFitToImageClick: () => void;
  onFitToBuildingClick: () => void;
  onFitToRoomClick: () => void;
  onGenerateIsometricClick: () => void;
  onProjectToIsometricClick: () => void;
  onLoad: () => void;
  onRotateClicked: () => void;
}

const PaddingBox = styled(Box, {name: 'PaddingBox'})(() => ({
  display: 'inline-flex',
  gap: 6,
  paddingBlock: 4,
  paddingInlineEnd: 4
}))

const getBarPosition = (screenCoordinates: number[], barRef: RefObject<HTMLDivElement>) => {
  if (screenCoordinates.length === 0 || !barRef.current) {
    return []
  }

  const padding = 10
  let x = screenCoordinates[0]
  let y = screenCoordinates[1] - padding
  const leftDistance = x - (barRef.current!.getBoundingClientRect().width / 2)
  const topDistance = y - barRef.current!.getBoundingClientRect().height
  const rightDistance = x + (barRef.current!.getBoundingClientRect().width / 2)
  const bottomDistance = y + (barRef.current!.getBoundingClientRect().height / 2)
  const screenWidth = window.innerWidth
  const screenHeight = window.innerHeight
  if (leftDistance < 0) {
    x = (barRef.current!.getBoundingClientRect().width / 2) + padding
  } else if (rightDistance > screenWidth) {
    x = screenWidth - (barRef.current!.getBoundingClientRect().width / 2) - padding
  }
  if (topDistance < 0) {
    y = barRef.current!.getBoundingClientRect().height + padding
    x = screenWidth / 2 // keep the bar fixed on the top/middle point
  } else if (bottomDistance > screenHeight) {
    y = screenHeight - padding
  }

  return [x, y]
}

const getBarPositionStyle = (visualization: Visualization, screenCoordinates: number[]): CSSProperties => {
  if (visualization.is3D() || visualization.isChart()) return {}

  return {
    margin: screenCoordinates[0] !== undefined ? '0' : '3px 0',
    left: screenCoordinates[0] !== undefined ? `0` : 'initial',
    top: screenCoordinates[1] !== undefined ? `0` : 'initial',
    position: screenCoordinates[1] !== undefined ? 'absolute' : 'initial',
    transform: screenCoordinates[1] !== undefined ? `translate3d(${screenCoordinates[0] ? 'calc(-50% + ' + screenCoordinates[0] + 'px)' : '0'}, ${screenCoordinates[1] ? 'calc(-100% + ' + screenCoordinates[1] + 'px)' : '0'}, 0)` : 'none',
    transition: screenCoordinates[1] !== undefined ? 'transform 0.1s ease, opacity 0.15s ease 0.1s' : 'none',
    opacity: screenCoordinates[0] !== undefined ? '1' : '0'
  }
}

class ImageCropToolbar extends PureComponent<StateProps & ActionProps, { barPosition: number[] }> {
  barRef = React.createRef<HTMLDivElement>()

  constructor(props: StateProps & ActionProps) {
    super(props)
    this.state = {barPosition: []}
  }

  componentDidMount(): void {
    this.setState({barPosition: getBarPosition(this.props.screenCoordinates, this.barRef)})
  }

  componentDidUpdate(prevProps: Readonly<StateProps & ActionProps>) {
    if (this.props.screenCoordinates[0] !== prevProps.screenCoordinates[0] || this.props.screenCoordinates[1] !== prevProps.screenCoordinates[1]) {
      this.setState({barPosition: getBarPosition(this.props.screenCoordinates, this.barRef)})
    }
  }

  render(): React.ReactNode {
    return (
      <CanvasNavigationBar
        className="horizontal"
        ref={this.barRef}
        style={getBarPositionStyle(this.props.visualization, this.state.barPosition)}>
        <CanvasNavigationButtonGroup className="horizontal">
          <Box sx={{display: 'flex', alignItems: 'center', paddingInline: 4}}>
            <Icon icon="crop"/>
          </Box>
          {!this.props.isCropping && !this.props.isCropLoading && <PaddingBox>
            <PillButton
              smallButton
              pillVariant="default"
              onClick={this.props.onCropCancel}
            >
              {i18n('CANCEL')}
            </PillButton>
            <PillButton
              smallButton
              disabled={!this.props.canCrop}
              pillVariant="primary"
              onClick={this.props.onCropApply}
            >
              {i18n('CROP')}
            </PillButton>
          </PaddingBox>}
          {this.props.isCropping && !this.props.isCropLoading && <PaddingBox>
            <PillButton
              smallButton
              disabled
            >
              {i18n('PROCESSING_ELLIPSIS')}
            </PillButton>
          </PaddingBox>}
          {this.props.isCropLoading && <>
            <PillButton
              smallButton
              disabled
            >
              {i18n('LOADING_ELLIPSIS')}
            </PillButton>
          </>}
        </CanvasNavigationButtonGroup>
      </CanvasNavigationBar>
    )
  }
}

export class RowToolbar extends PureComponent<StateProps & ActionProps, {
  barPosition: number[]
}> {
  barRef = React.createRef<HTMLDivElement>()

  constructor(props: StateProps & ActionProps) {
    super(props)
    this.state = {
      barPosition: [],
    }
  }

  componentDidMount(): void {
    this.setState({barPosition: getBarPosition(this.props.screenCoordinates, this.barRef)})
    this.props.onLoad()
  }

  shouldNotifyOnLoad(prevProps: Readonly<StateProps & ActionProps>) {
    return prevProps.row?._id && prevProps.rowsetId && !!(prevProps.row?._id !== this.props.row?._id || prevProps.rowsetId !== this.props.rowsetId)
  }

  componentDidUpdate(prevProps: Readonly<StateProps & ActionProps>) {
    if (this.props.screenCoordinates[0] !== prevProps.screenCoordinates[0] || this.props.screenCoordinates[1] !== prevProps.screenCoordinates[1]) {
      this.setState({barPosition: getBarPosition(this.props.screenCoordinates, this.barRef)})
    }
    if (this.shouldNotifyOnLoad(prevProps)) {
      this.props.onLoad()
    }
  }

  getImageUploadLabel() {
    if (this.props.canUpload) {
      return <Box sx={{'textAlign': 'center'}}>
        {i18n('REPLACE_IMAGE_ELLIPSIS')}
        <span style={{opacity: 0.5, fontSize: 11.5, display: 'block'}}>
          {i18n('VALID_IMAGE_FORMATS')}
        </span>
      </Box>
    }

    return <Box sx={{'textAlign': 'center'}}>
      {i18n('IMAGE_KEY_IS_NULL')}
    </Box>
  }

  getModelUploadLabel() {
    if (this.props.canUpload) {
      if (!cloudFeaturesEnabled) {
        return <Box sx={{'textAlign': 'center'}}>
          {i18n('REPLACE_3D_MODEL_ELLIPSIS')}
          <span style={{opacity: 0.5, fontSize: 11.5, display: 'block'}}>
            {i18n('VALID_MODEL_ONLY_FORMATS')}
          </span>
          <Box sx={{opacity: 0.5, fontSize: 11, marginTop: '4px'}}>
            <HoparaCloudBadge />:
          </Box>
          <Box sx={{opacity: 0.5, fontSize: 11}}>
            {i18n('IMAGE_TO_3D')}
          </Box>
        </Box>
      }
      return <Box sx={{'textAlign': 'center'}}>
        {i18n('REPLACE_3D_MODEL_ELLIPSIS')}
        <span style={{opacity: 0.5, fontSize: 11.5, display: 'block'}}>
          {i18n('VALID_MODEL_FORMATS')}
        </span>
      </Box>
    }

    return <Box sx={{'textAlign': 'center'}}>
      {i18n('MODEL_KEY_IS_NULL')}
    </Box>
  }

  render() {
    if (!this.props.visible) return null
    const isUndoOnly = ![LayerType.polygon, LayerType.model, LayerType.image].includes(this.props.layerType) && !this.props.unplaceVisible

    if (!this.props.undoVisible && isUndoOnly) return null

    if (this.props.layerType === LayerType.image && this.props.isCropMode) {
      return <ImageCropToolbar {...this.props} />
    }
    const canRotate = this.props.allowRotation && this.props.hasViewField

    return (
      <CanvasNavigationBar
        className="horizontal"
        key={this.props.row?._id}
        ref={this.barRef}
        style={getBarPositionStyle(this.props.visualization, this.state.barPosition)}>
        <CanvasNavigationButtonGroup className="horizontal contextual">
          {[LayerType.line, LayerType.polygon].includes(this.props.layerType) && <>
            <CanvasNavigationButton
              toggleable
              icon="polygon-transform-mode"
              label={i18n(`EDIT_MODE_TRANSFORM`)}
              tooltipPlacement="top"
              onClick={() => this.props.onViewLayerEditModeClick(ViewLayerEditingMode.TRANSFORM)}
              active={this.props.selectedViewLayerEditMode === ViewLayerEditingMode.TRANSFORM}/>
            <CanvasNavigationButton
              toggleable
              icon="polygon-modify-mode"
              label={i18n(`EDIT_MODE_MODIFY`)}
              tooltipPlacement="top"
              onClick={() => this.props.onViewLayerEditModeClick(ViewLayerEditingMode.MODIFY)}
              active={this.props.selectedViewLayerEditMode === ViewLayerEditingMode.MODIFY}/>
          </>}
          {this.props.layerType === LayerType.polygon && <>
            <CanvasNavigationButton
              icon="polygon-fit-to-image"
              label={i18n(`FIT_TO_IMAGE`) + (this.props.canFitToImage ? '' : ` (${i18n('THERE_ARE_NO_IMAGES_TO_FIT')})`)}
              tooltipPlacement="top"
              disabled={!this.props.canFitToImage || this.props.isFitting}
              onClick={() => this.props.onFitToImageClick()}/>
            <CanvasNavigationButton
              icon="polygon-fit-to-room"
              label={!cloudFeaturesEnabled
                ? <CloudFeatureLabel featureName={i18n('FIT_TO_ROOM')}/>
                : i18n(`FIT_TO_ROOM`) + (this.props.canFitToImage ? '' : ` (${i18n('THERE_ARE_NO_IMAGES_TO_FIT')})`)}
              tooltipPlacement="top"
              disabled={!cloudFeaturesEnabled || !this.props.canFitToImage || this.props.isFitting}
              onClick={() => this.props.onFitToRoomClick()}/>
            {this.props.canFitToBuilding && <CanvasNavigationButton
              icon="polygon-fit-to-building"
              label={!cloudFeaturesEnabled
                ? <CloudFeatureLabel featureName={i18n('FIT_TO_BUILDING')}/>
                : i18n(`FIT_TO_BUILDING`)}
              tooltipPlacement="top"
              disabled={!cloudFeaturesEnabled || this.props.isFitting}
              onClick={() => this.props.onFitToBuildingClick()}/>}
            {(this.props.unplaceVisible || this.props.undoVisible) && <CanvasNavigationDivider/>}
          </>}

          {this.props.layerType === LayerType.image && <>
            <UploadButton
              label={this.getImageUploadLabel()}
              disabled={!this.props.canUpload}
              accept={imageMimeTypes.join(',')}
              onUpload={this.props.onReplaceImageClick}
              progress={this.props.progress}
              status={this.props.status}
              innerComponent={<CanvasNavigationButton
                icon="replace-image"
                tooltipPlacement="top"
              />}
            />
            {!this.props.status &&
              <>
                {!this.props.allowRotation && this.props.allowImageEdit && <CanvasNavigationButton
                  icon={this.props.isGeneratingImage ? 'progress-activity' : 'generate-isometric'}
                  label={!cloudFeaturesEnabled
                    ? <CloudFeatureLabel featureName={i18n('GENERATE_ISOMETRIC_IMAGE')}/>
                    : i18n('GENERATE_ISOMETRIC_IMAGE')}
                  tooltipPlacement="top"
                  disabled={!cloudFeaturesEnabled}
                  onClick={this.props.onGenerateIsometricClick}
                />}
                {!this.props.allowRotation && this.props.allowImageEdit && <CanvasNavigationButton
                  icon={this.props.isGeneratingImage ? 'progress-activity' : 'generate-isometric'}
                  label={!cloudFeaturesEnabled
                    ? <CloudFeatureLabel featureName={i18n('PROJECT_TO_ISOMETRIC')}/>
                    : i18n('PROJECT_TO_ISOMETRIC')}
                  tooltipPlacement="top"
                  disabled={!cloudFeaturesEnabled}
                  onClick={this.props.onProjectToIsometricClick}
                />}

                {canRotate && <>
                  <CanvasNavigationButton
                    tooltipPlacement="top"
                    label={i18n('ROTATE')}
                    icon="rotate"
                    onClick={() => this.props.onRotateClicked()}
                  />
                </>}
              </>
            }


            {!canRotate && this.props.allowImageEdit && <CanvasNavigationButton
              toggleable
              icon="crop"
              label={i18n(`CROP_IMAGE`)}
              tooltipPlacement="top"
              disabled={!this.props.canCrop}
              onClick={() => this.props.onViewLayerEditModeClick(ViewLayerEditingMode.CROP)}
              active={this.props.selectedViewLayerEditMode === ViewLayerEditingMode.CROP}
            />}
            {this.props.canFitToBuilding && <CanvasNavigationButton
              icon="image-fit-to-building"
              label={!cloudFeaturesEnabled
                ? <CloudFeatureLabel featureName={i18n('FIT_TO_BUILDING')}/>
                : i18n(`FIT_TO_BUILDING`)}
              tooltipPlacement="top"
              disabled={!cloudFeaturesEnabled || this.props.isFitting}
              onClick={() => this.props.onFitToBuildingClick()}/>}
            {this.props.canUpload && <CanvasNavigationButton
              icon="image-history"
              label={i18n('SHOW_IMAGE_HISTORY')}
              tooltipPlacement="top"
              onClick={this.props.onShowImageHistoryClick}/>}
            {(this.props.unplaceVisible || this.props.undoVisible) && <CanvasNavigationDivider/>}
          </>}

          {this.props.layerType === LayerType.model && <>
            <UploadButton
              label={this.getModelUploadLabel()}
              disabled={!this.props.canUpload}
              accept={cloudFeaturesEnabled ? modelMimeTypes.join(',') : modelOnlyMimeTypes.join(',')}
              onUpload={this.props.onReplaceModelClick}
              progress={this.props.progress}
              status={this.props.status}
              innerComponent={<CanvasNavigationButton
                icon="upload"
                tooltipPlacement="top"
              />}
            />
            <CanvasNavigationButton
              icon="image-history"
              label={i18n('SHOW_MODEL_HISTORY')}
              tooltipPlacement="top"
              onClick={this.props.onShowModelHistoryClick}/>
          </>}

        {this.props.canUpdateOrder && <>
          <CanvasNavigationButton
              icon="bring-forward"
              label={i18n(`BRING_TO_FRONT`)}
              tooltipPlacement="top"
              disabled={this.props.isFitting}
              onClick={() => this.props.onBringToFrontClick()}/>

         <CanvasNavigationButton
              icon="send-backward"
              label={i18n(`SEND_TO_BACK`)}
              tooltipPlacement="top"
              disabled={this.props.isFitting}
              onClick={() => this.props.onSendToBackClick()}/>


          <CanvasNavigationDivider/>
          </>}

          {this.props.unplaceVisible && <>
            <CanvasNavigationButton
              testId="row-unplace-button"
              icon="unplace"
              label={<>
                {i18n('UNPLACE')}
                <span style={{'opacity': 0.5, 'paddingInlineStart': 3}}>
                  {acceleratorForPlatform('Delete')}
                </span>
              </>}
              tooltipPlacement="top"
              onClick={this.props.onUnplaceClick}/>
            {this.props.undoVisible && <CanvasNavigationDivider/>}
          </>}

          {this.props.undoVisible &&
            <RowSavedStatusComponent
              fullVersion={isUndoOnly}
              hasUndoRow={this.props.hasUndoRow}
              status={this.props.rowSavedStatus}
              onUndoClick={this.props.onUndoClick}
            />
          }
        </CanvasNavigationButtonGroup>
      </CanvasNavigationBar>
    )
  }
}
