import { client } from "@common";

export function useResetPassword() {
  const getBaseURL = (maarg: string) => {
    if (maarg.startsWith("http")) {
      const cleanMaarg = maarg.endsWith("/") ? maarg.slice(0, -1) : maarg;
      return cleanMaarg.includes("/rest/s1") ? cleanMaarg : `${cleanMaarg}/rest/s1/`;
    }
    return `https://${maarg}.hotwax.io/rest/s1/`;
  };

  const resetPassword = async (payload: any, maarg: string) => {
    return client({
      baseURL: getBaseURL(maarg),
      url: `admin/users/${payload.userId}/changePassword`,
      method: "post",
      data: {
        username: payload.username,
        oldPassword: payload.oldPassword,
        newPassword: payload.newPassword,
        newPasswordVerify: payload.newPasswordVerify
      }
    });
  };

  return {
    getBaseURL,
    resetPassword
  };
}
