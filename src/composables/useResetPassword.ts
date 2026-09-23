import { ref } from "vue";
import { client, commonUtil, logger, translate } from "@common";
import router from "@/router";

export function useResetPassword() {
  const isSubmitting = ref(false);

  // The emailed link only carries an API host reference (maarg), never a session -
  // requests here must not depend on cookies/auth state, so we build an explicit
  // baseURL and use the unauthenticated `client` instead of the app-wide `api()` helper.
  const getBaseURL = (maarg: string) => {
    if (maarg.startsWith("http")) {
      const cleanMaarg = maarg.endsWith("/") ? maarg.slice(0, -1) : maarg;
      return cleanMaarg.includes("/rest/s1") ? cleanMaarg : `${cleanMaarg}/rest/s1/`;
    }
    return `https://${maarg}.hotwax.io/rest/s1/`;
  };

  const submitResetPassword = async (payload: { userId: string; username: string; maarg: string; oldPassword: string; newPassword: string; newPasswordVerify: string }) => {
    isSubmitting.value = true;
    try {
      const resp = await client({
        baseURL: getBaseURL(payload.maarg),
        url: `admin/users/${payload.userId}/changePassword`,
        method: "post",
        data: {
          username: payload.username,
          oldPassword: payload.oldPassword,
          newPassword: payload.newPassword,
          newPasswordVerify: payload.newPasswordVerify
        }
      });

      // update#Password reports failures (wrong/missing old password, no permission, weak password) as a public
      // "danger" message with updateSuccessful: false, not as commonUtil.hasError's generic error shape.
      if (!commonUtil.hasError(resp) && resp.data?.updateSuccessful) {
        commonUtil.showToast(translate("Password reset successful. Please login with your new password."));
        router.replace("/login");
        return true;
      } else {
        throw resp.data;
      }
    } catch (error) {
      commonUtil.showToast(translate("Failed to reset password. Please check your reset password and try again."));
      logger.error(error);
      return false;
    } finally {
      isSubmitting.value = false;
    }
  };

  return {
    isSubmitting,
    submitResetPassword
  };
}