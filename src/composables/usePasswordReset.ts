import { client, commonUtil, logger, translate } from "@common";

export function usePasswordReset() {
  const getBaseURL = (maarg: string) => {
    if (maarg.startsWith("http")) {
      const cleanMaarg = maarg.endsWith("/") ? maarg.slice(0, -1) : maarg;
      return cleanMaarg.includes("/rest/s1") ? cleanMaarg : `${cleanMaarg}/rest/s1/`;
    }
    return `https://${maarg}.hotwax.io/rest/s1/`;
  };

  const resetPassword = async (payload: any) => {
    const { maarg, userId, ...data } = payload;
    try {
      const resp = await client({
        baseURL: getBaseURL(maarg),
        url: `admin/users/${userId}/changePassword`,
        method: "post",
        data
      });

      // update#Password reports failures (wrong/missing old password, no permission, weak password) as a public
      // "danger" message with updateSuccessful: false, not as commonUtil.hasError's generic error shape.
      if (!commonUtil.hasError(resp) && resp.data?.updateSuccessful) {
        return resp;
      } else {
        throw resp.data;
      }
    } catch (error) {
      logger.error(error);
      throw error;
    }
  };

  return { resetPassword };
}
