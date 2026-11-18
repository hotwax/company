import { onMounted, onUnmounted } from "vue";
import { alertController } from "@ionic/vue";
import { emitter, translate } from "@common";

export interface OmsInstanceChange {
  from: string;
  to: string;
}

/**
 * Asks the user to reload when a login in another tab or app moved the shared session cookies to
 * another OMS instance. The sync service has already stopped the worker (it would otherwise call the
 * old instance with the new instance's token); this tab's stores still hold the old instance's
 * session, so the only way forward is a reload. Mount once, in App.vue.
 */
export function useOmsInstanceChangeAlert() {
  let shown = false;

  async function showReloadAlert(change: OmsInstanceChange) {
    if (shown) return;
    shown = true;
    const alert = await alertController.create({
      header: translate("Signed in to another instance"),
      message: translate("This browser is now signed in to {instance} from another tab or app. Reload to continue.", { instance: change.to }),
      backdropDismiss: false,
      buttons: [{
        text: translate("Reload"),
        handler: () => { window.location.reload(); },
        htmlAttributes: { "data-testid": "oms-instance-changed-reload-btn" },
      }],
      htmlAttributes: { "data-testid": "oms-instance-changed-alert" },
    });
    await alert.present();
  }

  const onInstanceChanged = (change: unknown) => { void showReloadAlert(change as OmsInstanceChange); };

  onMounted(() => emitter.on("omsInstanceChanged", onInstanceChanged));
  onUnmounted(() => emitter.off("omsInstanceChanged", onInstanceChanged));

  return { showReloadAlert };
}
