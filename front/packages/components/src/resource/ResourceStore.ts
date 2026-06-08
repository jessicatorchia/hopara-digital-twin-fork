import { IsometricMethod } from './ResourceRepository'

export enum ResourceUploadStatus {
  UPLOADING = 'uploading',
  UPLOADED = 'uplodaded',
  PARTIAL = 'partial'
}

export enum ResourceGenerateStatus {
  GENERATING = 'generating',
  GENERATED = 'generated',
  ERROR = 'error'
}

export interface ResourceState {
  progress?: number
  resourceId: string
  library: string
  lastModified: Date
}

export interface ResourceUploadState extends ResourceState {
  status: ResourceUploadStatus
}

export interface ResourceGenerateState extends ResourceState {
  status: ResourceGenerateStatus
  method?: IsometricMethod
}

export class ResourceStore {
  upload: ResourceUploadState[]
  generate: ResourceGenerateState[]

  constructor(props?: Partial<ResourceStore>) {
    this.upload = [...props?.upload ?? []]
    this.generate = [...props?.generate ?? []]
  }

  clone(): ResourceStore {
    return new ResourceStore(this)
  }

  getResourceIndex(type: string, resource: Partial<ResourceState>) {
    return this[type].findIndex((r) => r.library === resource.library && r.resourceId === resource.resourceId)
  }

  upsertResource(type: string, resource: Omit<ResourceUploadState | ResourceGenerateState, 'lastModified'>) {
    const cloned = this.clone()
    const currentIndex = this.getResourceIndex(type, resource)
    const newState = {
      ...resource,
      lastModified: resource.status !== this[type][currentIndex]?.status ? new Date() : this[type][currentIndex]?.lastModified
    }

    if (currentIndex > -1) {
      cloned[type].splice(currentIndex, 1, newState)
    } else {
      cloned[type].push(newState)
    }

    return cloned
  }

  removeResource(type: string, resource: Partial<ResourceState>) {
    const cloned = this.clone()
    const currentIndex = this.getResourceIndex(type, resource)
    if (currentIndex > -1) {
      cloned[type].splice(currentIndex, 1)
    }
    return cloned
  }

  getUpload(library: string, resourceId: string) {
    return this.upload.find((up) => up.library === library && up.resourceId === resourceId)
  }

  upsertUpload(upload: Omit<ResourceUploadState, 'lastModified'>) {
    return this.upsertResource('upload', upload)
  }

  removeUpload(upload: Partial<ResourceUploadState>) {
    return this.removeResource('upload', upload)
  }

  getGenerate(library: string, resourceId: string) {
    return this.generate.find((up) => up.library === library && up.resourceId === resourceId)
  }

  upsertGenerate(generate: Omit<ResourceGenerateState, 'lastModified'>): ResourceStore {
    return this.upsertResource('generate', generate)
  }

  removeGenerate(generate: Partial<ResourceGenerateState>): ResourceStore {
    return this.removeResource('generate', generate)
  }
}
