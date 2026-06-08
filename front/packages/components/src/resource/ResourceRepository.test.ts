import { Authorization } from '@hopara/authorization'
import * as httpClient from '@hopara/http-client'
import { Config } from '@hopara/config'
import { ResourceRepository, IsometricMethod } from './ResourceRepository'

jest.mock('@hopara/http-client')

describe('ResourceRepository.generateIsometric', () => {
  const authorization = { tenant: 'my-tenant', toHTTPHeaders: () => ({}) } as unknown as Authorization

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Config, 'getValue').mockReturnValue('http://resource.test')
    ;(httpClient.httpPut as jest.Mock).mockResolvedValue({ data: { dimensions: { width: 1, height: 1 } } })
  })

  afterEach(() => jest.restoreAllMocks())

  it('sends the chosen method as the "method" query param', async () => {
    await ResourceRepository.generateIsometric('my-image', 'my-lib', IsometricMethod.ISOMETRIC_TOP, authorization)

    const call = (httpClient.httpPut as jest.Mock).mock.calls[0]
    // httpPut(endpoint, resource, body, queryParams, authorization, options)
    expect(call[1]).toContain('/generate')
    expect(call[3]).toEqual({ method: IsometricMethod.ISOMETRIC_TOP })
  })

  it('passes realistic method through unchanged', async () => {
    await ResourceRepository.generateIsometric('my-image', 'my-lib', IsometricMethod.REALISTIC, authorization)

    const call = (httpClient.httpPut as jest.Mock).mock.calls[0]
    expect(call[3]).toEqual({ method: IsometricMethod.REALISTIC })
  })
})
