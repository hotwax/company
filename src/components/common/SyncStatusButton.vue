<template>
  <template v-if="entries.length">
    <ion-button
      color="warning"
      :aria-label="translate('{count} sync problems', { count: entries.length })"
      @click="openDetails"
    >
      <ion-icon slot="icon-only" :icon="warningOutline" />
    </ion-button>
    <ion-popover :is-open="open" :event="openEvent" @did-dismiss="open = false">
      <ion-list lines="full">
        <ion-list-header>
          <ion-label class="ion-text-wrap">
            {{ translate("Some data could not be refreshed") }}
            <p v-if="note">{{ note }}</p>
          </ion-label>
        </ion-list-header>
        <ion-item v-for="entry in entries" :key="entry.domain" lines="full">
          <ion-label class="ion-text-wrap">
            {{ entry.label }}
            <p>{{ entry.message }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-popover>
  </template>
</template>

<script setup lang="ts">
import { translate } from "@common";
import { IonButton, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonPopover } from "@ionic/vue";
import { warningOutline } from "ionicons/icons";
import { computed, ref } from "vue";
import { CACHE_DOMAIN_CATALOG } from "@/utils/cacheDomainCatalog";

// Two root nodes (the button and its popover), so there is no single element to inherit attributes.
defineOptions({ inheritAttrs: false });

/**
 * Sync failures as a toolbar control rather than a banner. A banner inserted above the content moved
 * the whole page whenever it appeared or went, and a failure that recurs every tick made it do so
 * constantly; a button in the toolbar's end slot takes no content space. It lists every failing domain,
 * in the caller's priority order, so a secondary failure can no longer hide the one that explains an
 * empty page.
 */
const props = defineProps<{
  /** Domain → its latest failure message (`useCacheSync().failingDomains` or the inventory area's). */
  failures: Record<string, string>;
  /** Domains to list first, most important first; the rest follow in name order. */
  priority?: string[];
  /** One line of context for this page, shown above the list. */
  note?: string;
}>();

const open = ref(false);
const openEvent = ref<Event>();

function openDetails(event: Event) {
  openEvent.value = event;
  open.value = true;
}

const DOMAIN_LABELS = new Map(CACHE_DOMAIN_CATALOG.map((entry) => [entry.name, entry.label]));

function labelFor(domain: string): string {
  if(domain === "auth") {return translate("Sign-in");}
  if(domain === "__start") {return translate("Background sync");}

  return DOMAIN_LABELS.get(domain) ? translate(DOMAIN_LABELS.get(domain) as string) : domain;
}

/** OMS errors often arrive as a JSON body; the readable part is its `errors` text. */
function readable(message: string): string {
  try {
    const body = JSON.parse(message);
    const text = Array.isArray(body?.errors) ? body.errors.join(" ") : body?.errors ?? body?.message;
    if(typeof text === "string" && text.trim()) {return text.trim();}
  } catch {
    // Not JSON: the message is already text.
  }

  return message;
}

const entries = computed(() => {
  const rank = (domain: string) => {
    const index = props.priority?.indexOf(domain) ?? -1;

    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  return Object.entries(props.failures ?? {})
    .map(([domain, message]) => ({ domain, label: labelFor(domain), message: readable(message) }))
    .sort((a, b) => rank(a.domain) - rank(b.domain) || a.domain.localeCompare(b.domain));
});
</script>
