<template><ion-item v-if="result" lines="none" aria-label="Send result"><ion-spinner v-if="result.status === 'sending'" slot="start" /><ion-label class="ion-text-wrap"><h2>{{ translate(result.label) }}</h2><p v-if="result.messageId">{{ translate('System message') }}: {{ result.messageId }}</p><p v-if="result.error">{{ result.error }}</p></ion-label><ion-button v-if="result.destination" slot="end" fill="clear" @click="$emit('view', result.destination)">{{ translate(result.destination === 'synced' ? 'View in Synced' : 'View in Queued') }}</ion-button></ion-item></template>
<script setup lang="ts">
import { IonItem, IonLabel, IonButton, IonSpinner } from '@ionic/vue';
import { translate } from '@common';
defineProps<{result?: any}>(); defineEmits(['view']);
</script>
