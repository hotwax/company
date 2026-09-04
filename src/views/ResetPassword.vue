<template>
  <ion-page>
    <ion-content>
      <div class="flex">
        <form class="reset-password-container" @keyup.enter="handleSubmit()" @submit.prevent>
          <Logo />

          <section v-if="!isLinkValid">
            <ion-item lines="none">
              <ion-icon slot="start" color="warning" :icon="warningOutline" />
              <h4>{{ translate('Invalid reset password link') }}</h4>
            </ion-item>
            <p>{{ translate("This password reset link is invalid or incomplete. Please request a new password reset email.") }}</p>
          </section>

          <section v-else>
            <ion-item lines="none">
              <ion-input :label="translate('Username')" label-placement="stacked" name="username" :model-value="username" id="username" type="text" disabled />
            </ion-item>
            <ion-item lines="none">
              <ion-input
                :label="translate('Reset password')"
                label-placement="stacked"
                name="resetPassword"
                v-model="resetPassword"
                id="resetPassword"
                type="password"
                autocomplete="off"
                required
              />
            </ion-item>
            <ion-item lines="none">
              <ion-input
                id="newPassword"
                ref="newPasswordInput"
                v-model="newPassword"
                :label="translate('New password')"
                label-placement="stacked"
                name="newPassword"
                type="password"
                :error-text="translate('Password requirements not fulfilled.')"
                autocomplete="new-password"
                @keyup="validateNewPassword"
                @ion-blur="markTouched(newPasswordInput)"
              />
            </ion-item>
            <ion-item lines="none">
              <ion-input
                id="newPasswordVerify"
                ref="newPasswordVerifyInput"
                v-model="newPasswordVerify"
                :label="translate('Verify new password')"
                label-placement="stacked"
                name="newPasswordVerify"
                type="password"
                :error-text="translate('Passwords do not match.')"
                autocomplete="new-password"
                @keyup="validateNewPasswordVerify"
                @ion-blur="markTouched(newPasswordVerifyInput)"
              />
            </ion-item>

            <div class="ion-padding">
              <ion-button color="primary" expand="block" :disabled="isSubmitDisabled" @click="submit()">
                {{ translate("Reset password") }}
                <ion-spinner v-if="isSubmitting" slot="end" name="crescent" />
                <ion-icon v-else slot="end" :icon="arrowForwardOutline" />
              </ion-button>
            </div>
          </section>
        </form>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonButton, IonContent, IonIcon, IonInput, IonItem, IonPage, IonSpinner } from "@ionic/vue";
import { arrowForwardOutline, warningOutline } from "ionicons/icons";
import { commonUtil, logger, translate } from "@common";
import Logo from "@common/components/Logo.vue";
import router from "@/router";
import { usePasswordReset } from "@/composables/useSecurity";

const route = router.currentRoute.value;

const userId = (route.query.userId as string) || "";
const username = (route.query.username as string) || "";
const maarg = (route.query.maarg as string) || "";

const isLinkValid = computed(() => !!(userId && username && maarg));

const resetPassword = ref("");
const newPassword = ref("");
const newPasswordVerify = ref("");
const isSubmitting = ref(false);
const newPasswordInput = ref<any>(null);
const newPasswordVerifyInput = ref<any>(null);
const { resetPassword: submitPasswordReset } = usePasswordReset();



const inputElement = (inputRef: any) => inputRef.value?.$el || inputRef.value;

const markTouched = (inputRef: any) => {
  inputElement(inputRef)?.classList.add("ion-touched");
};

const validateNewPasswordVerify = () => {
  const element = inputElement(newPasswordVerifyInput);
  element?.classList.remove("ion-valid");
  element?.classList.remove("ion-invalid");

  if (newPasswordVerify.value === "") return;
  element?.classList.add(newPassword.value === newPasswordVerify.value ? "ion-valid" : "ion-invalid");
};

const validateNewPassword = () => {
  const element = inputElement(newPasswordInput);
  element?.classList.remove("ion-valid");
  element?.classList.remove("ion-invalid");

  if (newPassword.value === "") return;
  element?.classList.add(commonUtil.isValidPassword(newPassword.value) ? "ion-valid" : "ion-invalid");

  if (newPasswordVerify.value !== "") {
    validateNewPasswordVerify();
  }
};

const isSubmitDisabled = computed(() => {
  return isSubmitting.value ||
    !resetPassword.value ||
    !newPassword.value ||
    !newPasswordVerify.value ||
    newPassword.value !== newPasswordVerify.value ||
    !commonUtil.isValidPassword(newPassword.value);
});

const submit = async () => {
  if (isSubmitDisabled.value) return;

  isSubmitting.value = true;
  try {
    const resp = await submitPasswordReset(userId, maarg, {
        username,
        oldPassword: resetPassword.value,
        newPassword: newPassword.value,
        newPasswordVerify: newPasswordVerify.value
      });

    // update#Password reports failures (wrong/missing old password, no permission, weak password) as a public
    // "danger" message with updateSuccessful: false, not as commonUtil.hasError's generic error shape.
    if (!commonUtil.hasError(resp) && resp.data?.updateSuccessful) {
      commonUtil.showToast(translate("Password reset successful. Please login with your new password."));
      router.replace("/login");
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to reset password. Please check your reset password and try again."));
    logger.error(error);
  }
  isSubmitting.value = false;
};

const handleSubmit = () => {
  if (!isSubmitDisabled.value) submit();
};
</script>

<style scoped>
.reset-password-container {
  width: 400px;
}

.flex {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}
</style>
