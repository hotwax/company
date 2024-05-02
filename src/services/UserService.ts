import api, {client} from "@/api"
import store from "@/store";
import { hasError } from "@/utils";

const login = async (username: string, password: string): Promise <any> => {
  let token = ""
  try {
    const resp = await api({
      url: "login", 
      method: "post",
      data: {
        username,
        password
      }
    }) as any;

    if(!hasError(resp) && resp.data.token) {
      token = resp.data.token
    } else {
      throw "Sorry, login failed. Please try again";
    }
  } catch(err) {
    return Promise.reject("Sorry, login failed. Please try again");
  }
  return Promise.resolve(token)
}

const getUserProfile = async (token: any): Promise<any> => {
  const url = store.getters["user/getBaseUrl"]
  const baseURL = url.startsWith('http') ? url.includes('/rest/s1/order-routing') ? url : `${url}/rest/s1/order-routing/` : `https://${url}.hotwax.io/rest/s1/order-routing/`;
  try {
    const resp = await client({
      url: "user/profile",
      method: "GET",
      baseURL,
      headers: {
        "api_key": token,
        "Content-Type": "application/json"
      }
    });
    if(hasError(resp)) throw "Error getting user profile";
    return Promise.resolve(resp.data)
  } catch(error: any) {
    return Promise.reject(error)
  }
}

const getAvailableTimeZones = async (): Promise <any>  => {
  return api({
    url: "user/getAvailableTimeZones",
    method: "get",
    cache: true
  });
}
const setUserTimeZone = async (payload: any): Promise <any>  => {
  return api({
    url: "setUserTimeZone",
    method: "post",
    data: payload
  });
}

export const UserService = {
  getAvailableTimeZones,
  getUserProfile,
  login,
  setUserTimeZone,
}