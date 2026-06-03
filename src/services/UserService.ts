import { api } from '@common'

const getAvailableTimeZones = async (): Promise<any> => {
  return api({
    url: 'admin/user/getAvailableTimeZones',
    method: 'get',
    cache: true
  })
}

const getUserAccount = async (userId: string): Promise<any> => {
  return api({
    url: `admin/users/${encodeURIComponent(userId)}`,
    method: 'GET'
  })
}

const setUserTimeZone = async (payload: any): Promise<any> => {
  return api({
    url: 'admin/user/profile',
    method: 'post',
    data: payload
  })
}

export const UserService = {
  getAvailableTimeZones,
  getUserAccount,
  setUserTimeZone
}
