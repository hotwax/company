<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button v-if="redirectedFromUrl" slot="start" default-href="/users" @click="goBack($event)" />
        <ion-back-button v-else-if="userStore.hasPermission('USERS_LIST_VIEW OR PARTYMGR_VIEW OR PARTYMGR_ADMIN')" slot="start" default-href="/users" />
        <ion-title>{{ translate("User details") }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div v-if="!isUserFetched" class="empty-state">
        <ion-item lines="none">
          <ion-spinner slot="start" color="secondary" name="crescent" />
          {{ translate("Fetching user details") }}
        </ion-item>
      </div>
      <div v-else-if="!Object.keys(selectedUser).length" class="empty-state">
        <p>{{ translate("User not found") }}</p>
      </div>
      <main v-else>
        <section class="user-details">
          <ion-card v-if="isUserFetched || Object.keys(selectedUser).length" class="profile">
            <div>
              <ion-item lines="none">
                <ion-avatar slot="start">
                  <Image :src="imageUrl" />
                </ion-avatar>
                <ion-label class="ion-margin-start">
                  <h1 v-if="selectedUser.groupName">
                    {{ selectedUser.groupName }}
                  </h1>
                  <h1 v-else-if="selectedUser.firstName || selectedUser.lastName">
                    {{ selectedUser.firstName }} {{ selectedUser.lastName }}
                  </h1>
                  <h1 v-else>
                    {{ selectedUser.userFullName }}
                  </h1>
                  <p>{{ selectedUser.userLoginId }}</p>
                  <ion-badge v-if="selectedUser.userLoginId === userProfile.userLoginId">
                    {{ translate("Your user") }}
                  </ion-badge>
                </ion-label>
                <ion-button fill="outline" :disabled="!userStore.hasPermission('PARTYMGR_UPDATE OR PARTYMGR_ADMIN')" @click="editName">
                  {{ translate('Edit') }}
                </ion-button>
              </ion-item>
            </div>
            <div v-if="isUserFetched">
              <ion-item detail button @click="openCreatedByUserDetail">
                <ion-icon slot="start" :icon="bodyOutline" />
                <ion-label v-if="isCreatedBySystem()">
                  {{ translate("Created by", { userLoginId: "&#129502;" }) }}
                </ion-label>
                <ion-label v-else>
                  {{ translate("Created by", { userLoginId: selectedUser.createdByUserLogin }) }}
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-icon slot="start" :icon="cameraOutline" />
                <ion-label v-if="!imageUrl">
                  {{ translate("Add profile picture") }}
                </ion-label>
                <ion-label v-else>
                  {{ translate("Replace profile picture") }}
                </ion-label>
                <input id="profilePic" class="ion-hide" type="file" accept="image/*" :disabled="!userStore.hasPermission('PARTYMGR_UPDATE OR PARTYMGR_ADMIN')" @change="uploadImage" />
                <label for="profilePic">{{ translate("Upload") }}</label>
              </ion-item>
              <ion-item lines="none" :disabled="!userStore.hasPermission('PARTYMGR_STS_UPDATE OR PARTYMGR_UPDATE OR PARTYMGR_ADMIN')">
                <ion-icon slot="start" :icon="cloudyNightOutline" />
                <ion-toggle :checked="selectedUser.statusId === 'PARTY_DISABLED'" @click.prevent="updateUserStatus($event)">
                  {{ translate("Disable user") }}
                </ion-toggle>
              </ion-item>
            </div>
            <div v-else>
              <ion-item detail button>
                <ion-icon slot="start" :icon="bodyOutline" />
                <ion-label>{{ translate("Created by", {userLoginId: selectedUser.createdByUserLogin}) }}</ion-label>
              </ion-item>
              <ion-item>
                <ion-icon slot="start" :icon="cameraOutline" />
                <ion-skeleton-text animated />
              </ion-item>
              <ion-item lines="none">
                <ion-icon slot="start" :icon="cloudyNightOutline" />
                <ion-toggle :disabled="!userStore.hasPermission('PARTYMGR_STS_UPDATE OR PARTYMGR_UPDATE OR PARTYMGR_ADMIN')" :checked="selectedUser.statusId === 'PARTY_ENABLED'" @click.prevent="updateUserStatus($event)">
                  {{ translate("Disable user") }}
                </ion-toggle>
              </ion-item>
            </div>
          </ion-card>
          <ion-card v-else class="profile">
            <div>
              <ion-item lines="none">
                <ion-skeleton-text animated style="width: 10%;" />
                <ion-label class="ion-margin-start">
                  <ion-skeleton-text animated />
                  <ion-skeleton-text animated />
                  <ion-skeleton-text animated />
                  <ion-skeleton-text animated />
                </ion-label>
              </ion-item>
            </div>
            <div>
              <ion-item>
                <ion-icon slot="start" :icon="bodyOutline" />
                <ion-skeleton-text animated />
              </ion-item>
              <ion-item>
                <ion-icon slot="start" :icon="cameraOutline" />
                <ion-skeleton-text animated />
              </ion-item>
              <ion-item lines="none">
                <ion-icon slot="start" :icon="cloudyNightOutline" />
                <ion-label>{{ translate("Disable user") }}</ion-label>
                <ion-skeleton-text animated style="width: 30%;" />
              </ion-item>
            </div>
          </ion-card>
        </section>

        <section class="user-details">
          <ion-card v-if="isUserFetched || selectedUser.userLoginId">
            <ion-card-header>
              <ion-card-title>
                {{ translate('Login details') }}
              </ion-card-title>
            </ion-card-header>
            <template v-if="selectedUser.userLoginId">
              <ion-list>
                <ion-item>
                  <ion-label>{{ translate('Username') }}</ion-label>
                  <ion-label slot="end">
                    {{ selectedUser.userLoginId }}
                  </ion-label>
                </ion-item>
                <ion-item :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN') || selectedUser.statusId !== 'PARTY_ENABLED'">
                  <ion-toggle :checked="selectedUser.disabled == 'Y'" @click.prevent="updateUserLoginStatus($event)">
                    {{ translate("Block login") }}
                  </ion-toggle>
                </ion-item>
              </ion-list>
              <div class="login-detail-actions">
                <ion-button :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN') && selectedUser.userLoginId !== userProfile.userLoginId" fill="outline" color="warning" @click="resetPassword()">
                  {{ translate('Reset password') }}
                </ion-button>
                <ion-button :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN') || selectedUser.hasLoggedOut === 'Y'" fill="outline" color="danger" @click="confirmForceLogout()">
                  {{ translate('Force logout') }}
                </ion-button>
              </div>
            </template>
            <template v-else>
              <ion-list>
                <ion-item lines="full">
                  <ion-input id="username" v-model="username" label-placement="fixed" name="username">
                    <div slot="label">
                      {{ translate("Username") }} <ion-text color="danger">
                        *
                      </ion-text>
                    </div>
                  </ion-input>
                </ion-item>
                <ion-item ref="passwordRef" lines="none">
                  <ion-input
                    id="password"
                    v-model="password"
                    label-placement="fixed"
                    :placeholder="translate('Default password')"
                    name="password"
                    :type="showPassword ? 'text' : 'password'"
                    :helper-text="translate('will be asked to reset their password when they login to OMS.', { name: selectedUser.firstName ? selectedUser.firstName : selectedUser.groupName })"
                    :error-text="translate('Password should be at least 5 characters long and contain at least one number, alphabet and special character.')"
                    @ion-input="validatePassword"
                    @ion-blur="markPasswordTouched"
                  >
                    <div slot="label">
                      {{ translate("Password") }} <ion-text color="danger">
                        *
                      </ion-text>
                    </div>
                    <ion-button slot="end" size="default" fill="clear" @click="showPassword = !showPassword">
                      <ion-icon slot="icon-only" :icon="showPassword ? eyeOutline : eyeOffOutline" />
                    </ion-button>
                  </ion-input>
                </ion-item>
              </ion-list>
              <ion-button :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN')" fill="outline" expand="block" @click="createNewUserLogin()">
                {{ translate('Add credentials') }}
              </ion-button>
            </template>
          </ion-card>
          <ion-card v-else>
            <ion-card-header>
              <ion-card-title>
                {{ translate('Login details') }}
              </ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item>
                <ion-label>{{ translate('Username') }}</ion-label>
                <ion-skeleton-text animated style="width: 40%;" />
              </ion-item>
              <ion-item>
                <ion-label>{{ translate("Block login") }}</ion-label>
                <ion-skeleton-text animated style="width: 40%;" />
              </ion-item>
            </ion-list>
            <ion-button disabled fill="outline" color="warning" expand="block">
              {{ translate('Reset password') }}
            </ion-button>
          </ion-card>

          <ion-card v-if="isUserFetched">
            <ion-card-header>
              <ion-card-title>
                {{ translate('Contact details') }}
              </ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item>
                <ion-icon slot="start" :icon="mailOutline" />
                <ion-label class="ion-text-wrap">
                  {{ selectedUser?.emailDetails ? selectedUser.emailDetails.email : translate('Email') }}
                </ion-label>
                <ion-button v-if="selectedUser?.emailDetails" slot="end" size="default" fill="clear" color="medium" @click="openContactActionsPopover($event, 'email', selectedUser.emailDetails.email)">
                  <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                </ion-button>
                <ion-button v-else slot="end" size="default" fill="clear" :disabled="!userStore.hasPermission('PARTYMGR_PCM_CREATE OR PARTYMGR_ADMIN')" @click="addContactField('email')">
                  <ion-icon slot="icon-only" :icon="addCircleOutline" />
                </ion-button>
              </ion-item>
              <ion-item>
                <ion-icon slot="start" :icon="callOutline" />
                <ion-label class="ion-text-wrap">
                  {{ selectedUser?.phoneNumberDetails ? selectedUser.phoneNumberDetails.contactNumber : translate('Phone number') }}
                </ion-label>
                <ion-button v-if="selectedUser?.phoneNumberDetails" slot="end" size="default" fill="clear" color="medium" @click="openContactActionsPopover($event, 'phoneNumber', selectedUser.phoneNumberDetails.contactNumber)">
                  <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                </ion-button>
                <ion-button v-else slot="end" size="default" fill="clear" :disabled="!userStore.hasPermission('PARTYMGR_PCM_CREATE OR PARTYMGR_ADMIN')" @click="addContactField('phoneNumber')">
                  <ion-icon slot="icon-only" :icon="addCircleOutline" />
                </ion-button>
              </ion-item>
              <ion-item lines="none">
                <ion-icon slot="start" :icon="businessOutline" />
                <ion-label class="ion-text-wrap">
                  {{ selectedUser.externalId ? selectedUser.externalId : translate('External ID') }}
                </ion-label>
                <ion-button v-if="selectedUser.externalId" slot="end" size="default" fill="clear" color="medium" @click="openContactActionsPopover($event, 'externalId', selectedUser.externalId)">
                  <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                </ion-button>
                <ion-button v-else slot="end" size="default" fill="clear" :disabled="!userStore.hasPermission('PARTYMGR_UPDATE OR PARTYMGR_ADMIN')" @click="addContactField('externalId')">
                  <ion-icon slot="icon-only" :icon="addCircleOutline" />
                </ion-button>
              </ion-item>
            </ion-list>
          </ion-card>
          <ion-card v-else>
            <ion-card-header>
              <ion-card-title>
                {{ translate('Contact details') }}
              </ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item>
                <ion-icon slot="start" :icon="mailOutline" />
                <ion-skeleton-text animated />
              </ion-item>
              <ion-item>
                <ion-icon slot="start" :icon="callOutline" />
                <ion-skeleton-text animated />
              </ion-item>
              <ion-item lines="none">
                <ion-icon slot="start" :icon="businessOutline" />
                <ion-skeleton-text animated />
              </ion-item>
            </ion-list>
          </ion-card>
        </section>

        <div class="section-header">
          <h1>{{ translate('Permissions') }}</h1>
        </div>

        <section class="user-details">
          <ion-card v-if="isUserFetched">
            <ion-card-header>
              <ion-card-title>
                {{ translate('Clearance') }}
              </ion-card-title>
            </ion-card-header>

            <ion-list>
              <ion-list-header color="light">
                <ion-label>{{ translate('Security Group') }}</ion-label>
                <ion-button v-if="userSecurityGroups.length" :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN OR PARTY_SECURITY_ASSIGNMENT') || !selectedUser.userLoginId" @click="selectSecurityGroup()">
                  {{ translate('Add') }}
                  <ion-icon slot="end" :icon="addCircleOutline" />
                </ion-button>
              </ion-list-header>
              <ion-button v-if="!userSecurityGroups.length" :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN OR PARTY_SECURITY_ASSIGNMENT') || !selectedUser.userLoginId" fill="outline" expand="block" class="ion-margin" @click="selectSecurityGroup()">
                <ion-icon slot="start" :icon="addOutline" />
                {{ translate('Add to security group') }}
              </ion-button>
              <ion-item v-if="!selectedUser.userLoginId">
                <ion-label>{{ translate('Security groups can only be assigned after a login is created. Please add login credentials for above.') }}</ion-label>
              </ion-item>
              <ion-item v-else>
                <ion-label>{{ translate("View history") }}</ion-label>
                <ion-button slot="end" size="default" fill="clear" color="medium" @click="openUserSecurityGroupAssocHistoryModal()">
                  <ion-icon slot="icon-only" :icon="timeOutline" />
                </ion-button>
              </ion-item>

              <template v-if="!userStore.hasPermission('WEBTOOLS_VIEW') && checkUserAssociatedSecurityGroup('SUPER')">
                <ion-item lines="none" :disabled="true">
                  <ion-label>{{ translate('Super') }}</ion-label>
                  <ion-button slot="end" size="default" fill="clear" color="medium">
                    <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                  </ion-button>
                </ion-item>
              </template>
              <template v-else>
                <ion-item v-for="securityGroup in userSecurityGroups" :key="securityGroup.userGroupId" :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN OR PARTY_SECURITY_ASSIGNMENT')">
                  <ion-label>
                    {{ securityGroup.description || securityGroup.userGroupId }}
                  </ion-label>
                  <ion-button slot="end" size="default" fill="clear" color="medium" @click="openSecurityGroupActionsPopover($event, securityGroup)">
                    <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                  </ion-button>
                </ion-item>
              </template>

              <ion-list-header color="light">
                <ion-label>{{ translate('Product stores') }}</ion-label>
                <ion-button v-if="userProductStores.length" :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN')" @click="selectProductStore()">
                  {{ translate('Add') }}
                  <ion-icon slot="end" :icon="addCircleOutline" />
                </ion-button>
              </ion-list-header>

              <ion-button v-if="!userProductStores.length" :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN')" fill="outline" expand="block" class="ion-margin" @click="selectProductStore()">
                <ion-icon slot="start" :icon="addOutline" />
                {{ translate('Add to a product store') }}
              </ion-button>

              <ion-item v-for="store in userProductStores" :key="store.productStoreId" :disabled="!userStore.hasPermission('SECURITY_CREATE OR SECURITY_ADMIN')">
                <ion-label>
                  <h2>{{ store.storeName || store.productStoreId }}</h2>
                  <p>{{ getRoleTypeDesc(store.roleTypeId) }}</p>
                </ion-label>
                <ion-button slot="end" size="default" fill="clear" color="medium" @click="openProductStoreActionsPopover($event, store)">
                  <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                </ion-button>
              </ion-item>
            </ion-list>
          </ion-card>
          <ion-card v-else>
            <ion-card-header>
              <ion-card-title>
                {{ translate('Clearance') }}
              </ion-card-title>
            </ion-card-header>
            <ion-item lines="none">
              <ion-icon slot="start" :icon="businessOutline" />
              <ion-label>{{ translate('Security Group') }}</ion-label>
              <ion-skeleton-text animated style="width: 40%;" />
            </ion-item>
            <ion-button disabled fill="outline" expand="block">
              <ion-icon slot="start" :icon="addOutline" />
              {{ translate('Add to a product store') }}
            </ion-button>
          </ion-card>

          <ion-card v-if="isUserFetched">
            <ion-card-header>
              <ion-card-title>
                {{ translate('Fulfillment') }}
              </ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item :disabled="!userStore.hasPermission('STOREFULFILLMENT_ADMIN')">
                <ion-toggle :checked="selectedUser?.isWarehousePicker" @click.prevent="updatePickerRoleStatus($event)">
                  {{ translate("Show as picker") }}
                </ion-toggle>
              </ion-item>
              <ion-item v-if="isUserFulfillmentAdmin">
                <ion-label>{{ translate("This user has 'STOREFULFILLMENT_ADMIN' permission, enabling access to all facilities.") }}</ion-label>
              </ion-item>
              <ion-item lines="none" button detail :disabled="!userStore.hasPermission('STOREFULFILLMENT_ADMIN') || checkUserAssociatedSecurityGroup('INTEGRATION')" @click="selectFacility()">
                <ion-label> {{ getUserFacilities().length === 1 ? translate('Added to 1 facility') : translate('Added to facilities', { count: getUserFacilities().length }) }}</ion-label>
              </ion-item>
            </ion-list>
          </ion-card>
          <ion-card v-else>
            <ion-card-header>
              <ion-card-title>
                {{ translate('Fulfillment') }}
              </ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item>
                <ion-skeleton-text animated />
              </ion-item>
              <ion-item lines="none">
                <ion-skeleton-text animated />
              </ion-item>
            </ion-list>
          </ion-card>

          <ion-card v-if="isUserFetched">
            <ion-card-header>
              <ion-card-title>
                {{ translate('Favorites') }}
              </ion-card-title>
            </ion-card-header>
            <ion-card-content>
              {{ translate('Select your favorites to preselect them across all applications') }}
            </ion-card-content>
            <ion-list>
              <ion-item>
                <ion-select :label="translate('Product store')" interface="popover" :value="selectedUser.favoriteProductStorePref?.preferenceValue ? selectedUser.favoriteProductStorePref?.preferenceValue : ''" :disabled="!selectedUser?.userLoginId" @ion-change="updateFavoriteProductStore($event)">
                  <ion-select-option v-for="productStore in userProductStores" :key="productStore.productStoreId" :value="productStore.productStoreId">
                    {{ productStore.storeName || productStore.productStoreId }}
                  </ion-select-option>
                  <ion-select-option value="">
                    {{ translate("None") }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item lines="none">
                <ion-select :label="translate('Shopify shop')" interface="popover" :value="selectedUser.favoriteShopifyShopPref?.preferenceValue ? selectedUser.favoriteShopifyShopPref?.preferenceValue : ''" :disabled="!selectedUser?.userLoginId" @ion-change="updateFavoriteShopifyShop($event)">
                  <ion-select-option v-for="shopifyShop in shopifyShopsForProductStore" :key="shopifyShop.shopId" :value="shopifyShop.shopId">
                    {{ shopifyShop.name || shopifyShop.shopId }}
                  </ion-select-option>
                  <ion-select-option value="">
                    {{ translate("None") }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
            </ion-list>
          </ion-card>
          <ion-card v-else>
            <ion-card-header>
              <ion-card-title>
                {{ translate('Favorites') }}
              </ion-card-title>
            </ion-card-header>
            <ion-list>
              <ion-item>
                <ion-skeleton-text animated />
              </ion-item>
              <ion-item lines="none">
                <ion-skeleton-text animated />
              </ion-item>
            </ion-list>
          </ion-card>
        </section>
      </main>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonAvatar, IonBackButton, IonBadge, IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonPage, IonSelect, IonSelectOption, IonSkeletonText, IonSpinner, IonText, IonTitle, IonToggle, IonToolbar, alertController, modalController, onIonViewWillEnter, onIonViewWillLeave, popoverController } from "@ionic/vue";
import router from "@/router";
import { useUserStore } from "@/store/user";
import { useUtilStore } from "@/store/util";
import { addCircleOutline, addOutline, bodyOutline, businessOutline, callOutline, cameraOutline, cloudyNightOutline, ellipsisVerticalOutline, eyeOffOutline, eyeOutline, mailOutline, timeOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from "@common";
import ContactActionsPopover from "@/components/ContactActionsPopover.vue";
import ProductStoreActionsPopover from "@/components/ProductStoreActionsPopover.vue";
import SecurityGroupActionsPopover from "@/components/SecurityGroupActionsPopover.vue";
import ResetPasswordModal from "@/components/ResetPasswordModal.vue";
import SelectFacilityModal from "@/components/SelectFacilityModal.vue";
import SelectProductStoreModal from "@/components/SelectProductStoreModal.vue";
import SelectSecurityGroupModal from "@/components/SelectSecurityGroupModal.vue";
import UserSecurityGroupAssocHistoryModal from "@/components/UserSecurityGroupAssocHistoryModal.vue";
import { DateTime } from "luxon";
import Image from "@/components/Image.vue";

const props = defineProps({
  userId: {
    type: String,
    required: true
  }
});

const userStore = useUserStore();
const utilStore = useUtilStore();

const passwordRef = ref<any>(null);

const OPTIONS = {
  email: {
    header: "Add email",
    placeholder: "Email"
  },
  phoneNumber: {
    header: "Add phone number",
    placeholder: "Phone number"
  },
  externalId: {
    header: "Add external ID",
    placeholder: "External ID"
  }
};

const username = ref("");
const password = ref("");
const isUserFetched = ref(false);
const showPassword = ref(false);
const shopifyShopsForProductStore = ref<any[]>([]);
const isUserFulfillmentAdmin = ref(false);

const selectedUser = computed(() => userStore.selectedUser);
const userProductStores = computed(() => userStore.getSelectedUserProductStores);
const userSecurityGroups = computed(() => userStore.getSelectedUserSecurityGroups);
const getRoleTypeDesc = (roleTypeId: string) => utilStore.getRoleTypeDesc(roleTypeId);
const userProfile = computed(() => userStore.getUserProfile);
const shopifyShops = computed(() => utilStore.getShopifyShops);
const organizationPartyId = computed(() => utilStore.getOrganizationPartyId);
const redirectedFromUrl = computed(() => userStore.getRedirectedFromUrl);
const imageUrl = computed(() => {
  const partyImageUrl = selectedUser.value.partyImageUrl;
  if(!partyImageUrl) {return "";}

  return (commonUtil.getMaargBaseURL().startsWith("http") ? commonUtil.getMaargBaseURL().replace(/api\/?/, "") : `https://${commonUtil.getMaargBaseURL()}.hotwax.io/`) + partyImageUrl;
});

onIonViewWillLeave(async () => {
  await userStore.updateRedirectedFromUrl("");
});

onIonViewWillEnter(async () => {
  isUserFetched.value = false;
  await userStore.getSelectedUserDetails({ userId: props.userId, isFetchRequired: true });
  await Promise.all([utilStore.fetchUserGroups(), utilStore.fetchShopifyShopConfigs()]);
  const productStoreId = selectedUser.value.favoriteProductStorePref?.preferenceValue;
  if(productStoreId) {
    getShopifyShops(productStoreId);
  }
  isUserFulfillmentAdmin.value = selectedUser.value.securityGroups?.length ? await userStore.isUserFulfillmentAdmin(selectedUser.value.securityGroups.map((group: any) => group.userGroupId)) : false;
  isUserFetched.value = true;
  username.value = selectedUser.value.groupName ? (selectedUser.value.groupName)?.toLowerCase() : (`${selectedUser.value.firstName}.${selectedUser.value.lastName}`?.toLowerCase()) || "";
});

const checkUserAssociatedSecurityGroup = (securityGroupId: any) => {
  return userSecurityGroups.value?.some((userSecurityGroup: any) => userSecurityGroup.userGroupId === securityGroupId);
};

const getShopifyShops = (productStoreId: string) => {
  shopifyShopsForProductStore.value = shopifyShops.value.filter((shopifyShop: any) => shopifyShop.productStoreId === productStoreId);
};

const updateFavoriteProductStore = (event: any) => {
  const selectedProductStoreId = event.target.value;
  if(selectedProductStoreId && selectedProductStoreId !== selectedUser.value?.favoriteProductStorePref?.preferenceValue) {
    userStore.setFavoriteProductStore({ "userId": selectedUser.value?.userLoginId, "productStoreId": selectedProductStoreId })
      .then(() => {
        getShopifyShops(selectedProductStoreId);
        commonUtil.showToast(translate("Favorite product store updated successfully."));
      }).catch(() => {
        commonUtil.showToast(translate("Failed to set favorite product store."));
      });
  }
};

const goBack = ($event: any) => {
  $event.preventDefault();
  window.history.go(-2);
};

const updateFavoriteShopifyShop = (event: any) => {
  const selectedShopId = event.target.value;
  if(selectedShopId && selectedShopId !== selectedUser.value?.favoriteShopifyShopPref?.preferenceValue) {
    userStore.setFavoriteShopifyShop({ "userId": selectedUser.value?.userLoginId, "shopId": selectedShopId })
      .then(() => {
        commonUtil.showToast(translate("Favorite shopify shop updated successfully."));
      }).catch(() => {
        commonUtil.showToast(translate("Failed to set favorite shopify shop."));
      });
  }
};

const openContactActionsPopover = async (event: Event, type: string, value: string) => {
  const contactActionsPopover = await popoverController.create({
    component: ContactActionsPopover,
    event,
    componentProps: {
      type,
      placeholder: OPTIONS[type as "email" | "phoneNumber" | "externalId"].placeholder,
      value,
      contactMechId: type === "email"
        ? selectedUser.value.emailDetails.contactMechId
        : (type === "phoneNumber"
          ? selectedUser.value.phoneNumberDetails.contactMechId
          : "")
    },
    showBackdrop: false,
  });

  return contactActionsPopover.present();
};

const openCreatedByUserDetail = () => {
  if(isCreatedBySystem()) {
    window.open("https://youtu.be/dQw4w9WgXcQ?si=cPE1jkfRLPiebJuW", "_blank");
  } else {
    router.push({ path: `/user-details/${selectedUser.value.createdByUserPartyId}` });
  }
};

const isCreatedBySystem = () => {
  return !selectedUser.value.createdByUserLogin || selectedUser.value.createdByUserLogin === "system";
};

const addContactField = async (type: string) => {
  const contactUpdateAlert = await alertController.create({
    header: translate(OPTIONS[type as "email" | "phoneNumber" | "externalId"].header),
    inputs: [{
      name: "input",
      placeholder: translate(OPTIONS[type as "email" | "phoneNumber" | "externalId"].placeholder),
    }],
    buttons: [{
      text: translate("Cancel"),
      role: "cancel"
    },
    {
      text: translate("Save"),
      handler: async (result) => {
        const input = result.input.trim();
        if(!input) {
          commonUtil.showToast(translate("Please enter a value"));

          return false;
        }

        let updatedSelectedUser = JSON.parse(JSON.stringify(selectedUser.value));
        try {
          if(type === "email") {
            if(!commonUtil.isValidEmail(input)) {
              commonUtil.showToast(translate("Invalid email address."));

              return false;
            }

            const resp = await userStore.createUpdatePartyEmailAddress({
              emailAddress: input,
              partyId: selectedUser.value.partyId,
              contactMechPurposeTypeId: "PRIMARY_EMAIL"
            });
            if(commonUtil.hasError(resp)) {throw resp.data;}
            updatedSelectedUser = {
              ...updatedSelectedUser,
              emailDetails: {
                email: input,
                contactMechId: resp.data.contactMechId
              }
            };
          } else if(type === "phoneNumber") {
            const resp = await userStore.createUpdatePartyTelecomNumber({
              contactNumber: input,
              partyId: selectedUser.value.partyId,
              contactMechPurposeTypeId: "PRIMARY_PHONE"
            });
            if(commonUtil.hasError(resp)) {throw resp.data;}
            updatedSelectedUser = {
              ...updatedSelectedUser,
              phoneNumberDetails: {
                contactNumber: input,
                contactMechId: resp.data.contactMechId
              }
            };
          } else {
            const resp = await userStore.updatePartyExternalId({
              externalId: input,
              partyId: selectedUser.value.partyId
            });
            if(commonUtil.hasError(resp)) {throw resp.data;}
            updatedSelectedUser = {
              ...updatedSelectedUser,
              externalId: input
            };
          }
          userStore.updateSelectedUser(updatedSelectedUser);
          commonUtil.showToast(translate(`${OPTIONS[type as "email" | "phoneNumber" | "externalId"].placeholder} added successfully.`));
        } catch (error) {
          commonUtil.showToast(translate(`Failed to add ${type === "email" ? "email" : (type === "phoneNumber" ? "phone number" : "external ID")}.`));
          logger.error(error);
        }

        return true;
      }
    }]
  });
  await contactUpdateAlert.present();
};

const validatePassword = (event: any) => {
  const value = event.target.value;
  if(!passwordRef.value) {return;}
  passwordRef.value.$el.classList.remove("ion-valid");
  passwordRef.value.$el.classList.remove("ion-invalid");

  if(value === "") {return;}

  if(commonUtil.isValidPassword(value)) {
    passwordRef.value.$el.classList.add("ion-valid");
  } else {
    passwordRef.value.$el.classList.add("ion-invalid");
  }
};

const markPasswordTouched = () => {
  if(passwordRef.value) {
    passwordRef.value.$el.classList.add("ion-touched");
  }
};

const createNewUserLogin = async () => {
  username.value = username.value.trim();
  let missingFields = "";

  if(!password.value && !username.value) {
    missingFields = "username and password";
  } else if(!password.value) {
    missingFields = "password";
  } else if(!username.value) {
    missingFields = "username";
  }

  if(!password.value || !username.value) {
    commonUtil.showToast(translate("Please add a to create a user login", { missingFields }));

    return;
  }

  if(await userStore.isUserLoginIdAlreadyExists(username.value)) {
    return;
  }

  try {
    const resp = await userStore.createNewUserLogin({
      partyId: selectedUser.value.partyId,
      currentPassword: password.value,
      currentPasswordVerify: password.value,
      userLoginId: username.value,
      enabled: "Y",
      userPrefTypeId: "ORGANIZATION_PARTY",
      userPrefValue: organizationPartyId.value,
    });
    if(!commonUtil.hasError(resp)) {
      await userStore.getSelectedUserDetails({ userId: username.value, isFetchRequired: true });
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Something went wrong."));
    logger.error(error);
  }
};

const resetPassword = async () => {
  const resetPasswordModal = await modalController.create({
    component: ResetPasswordModal,
    componentProps: {
      email: selectedUser.value.emailDetails?.email,
      userLoginId: selectedUser.value.userLoginId
    }
  });

  return resetPasswordModal.present();
};

const confirmForceLogout = async () => {
  const message = "Are you sure you want to perform this action?";
  const alert = await alertController.create({
    header: translate("Force logout user"),
    message: translate(message),
    buttons: [
      {
        text: translate("No"),
      },
      {
        text: translate("Yes"),
        handler: async () => {
          await forceLogout();
        }
      }
    ],
  });

  return alert.present();
};

const forceLogout = async () => {
  try {
    const resp = await userStore.forceLogout({
      userId: selectedUser.value.userLoginId
    });
    if(commonUtil.hasError(resp)) {
      throw resp;
    }
    await userStore.getSelectedUserDetails({ userId: props.userId, isFetchRequired: true });
    commonUtil.showToast(translate("User has been logged out."));
  } catch (error) {
    commonUtil.showToast(translate("Failed to perform force logout."));
    logger.error(error);
  }
};

const updateUserLoginStatus = async (event: any) => {
  event.stopImmediatePropagation();

  const isChecked = !event.target.checked;
  const header = isChecked ? "Block user login" : "Unblock user login";
  const message = isChecked ? "Block this user from logging into HotWax Commerce. Login can be re-enabled by disabling this setting" : "Unblocking a user will allow them to login to the OMS again with their credentials.";

  const alert = await alertController.create({
    header: translate(header),
    message: translate(message),
    buttons: [{
      text: translate("No"),
      role: ""
    }, {
      text: translate("Yes"),
      role: "success",
      handler: async () => {
        try {
          const resp = await userStore.updateUserLoginStatus({
            userId: selectedUser.value.userLoginId,
            disabled: isChecked ? "Y" : "N"
          });
          if(!commonUtil.hasError(resp)) {
            commonUtil.showToast(translate("User login status updated successfully."));
            event.target.checked = isChecked;
            selectedUser.value.disabled = isChecked ? "Y" : "N";
          } else {
            throw resp.data;
          }
        } catch (error) {
          commonUtil.showToast(translate("Failed to update user login status."));
          logger.error(error);
        }
      }
    }],
  });

  await alert.present();
};

const openSecurityGroupActionsPopover = async (event: Event, securityGroup: any) => {
  const securityGroupActionsPopover = await popoverController.create({
    component: SecurityGroupActionsPopover,
    componentProps: {
      securityGroup
    },
    event,
    showBackdrop: false,
  });
  securityGroupActionsPopover.present();

  const result = await securityGroupActionsPopover.onDidDismiss();
  isUserFulfillmentAdmin.value = result.data?.length ? await userStore.isUserFulfillmentAdmin(result.data.map((group: any) => group.userGroupId)) : false;
};

const openProductStoreActionsPopover = async (event: Event, store: any) => {
  const productStoreActionsPopover = await popoverController.create({
    component: ProductStoreActionsPopover,
    componentProps: {
      productStore: store
    },
    event,
    showBackdrop: false,
  });

  return productStoreActionsPopover.present();
};

const selectFacility = async () => {
  const componentProps = {
    selectedFacilities: getUserFacilities()
  } as any;

  if(selectedUser.value.partyTypeId === "PARTY_GROUP") {
    componentProps.isFacilityLogin = true;
  }

  const selectFacilityModal = await modalController.create({
    component: SelectFacilityModal,
    componentProps
  });

  selectFacilityModal.onDidDismiss().then(async (result) => {
    if(result.data && result.data.value) {
      const facilitiesToAdd = result.data.value.facilitiesToAdd;
      const facilitiesToRemove = result.data.value.facilitiesToRemove;

      const removeResponses = await Promise.allSettled(facilitiesToRemove
        .map(async (payload: any) => await userStore.removePartyFromFacility({
          partyId: selectedUser.value.partyId,
          facilityId: payload.facilityId,
          roleTypeId: payload.roleTypeId,
          fromDate: payload.fromDate,
          thruDate: DateTime.now().toMillis()
        })));

      if(facilitiesToAdd.length) {
        try {
          const resp = await userStore.ensurePartyRole({
            partyId: selectedUser.value.partyId,
            roleTypeId: "WAREHOUSE_PICKER",
          });
          if(commonUtil.hasError(resp)) {
            commonUtil.showToast(translate("Something went wrong."));
            throw resp.data;
          }
        } catch (error) {
          logger.error(error);

          return;
        }
      }

      const createResponses = await Promise.allSettled(facilitiesToAdd
        .map(async (payload: any) => await userStore.addPartyToFacility({
          partyId: selectedUser.value.partyId,
          facilityId: payload.facilityId,
          roleTypeId: "WAREHOUSE_PICKER",
        })));

      const hasFailedResponse = [...removeResponses, ...createResponses].some((response: any) => response.status === "rejected");
      if(hasFailedResponse) {
        commonUtil.showToast(translate("Failed to update some association(s)."));
      } else {
        commonUtil.showToast(translate("Facility associations updated successfully."));
      }
      const userFacilities = await userStore.getUserFacilities(selectedUser.value.partyId);
      userStore.updateSelectedUser({ ...selectedUser.value, facilities: userFacilities });
    }
  });

  return selectFacilityModal.present();
};

const selectSecurityGroup = async () => {
  const selectSecurityGroupModal = await modalController.create({
    component: SelectSecurityGroupModal,
    componentProps: { selectedSecurityGroups: userSecurityGroups.value }
  });

  selectSecurityGroupModal.onDidDismiss().then(async (result) => {
    if(result.data && result.data.value) {
      const securityGroupsToCreate = result.data.value.securityGroupsToCreate;
      const securityGroupsToRemove = result.data.value.securityGroupsToRemove;

      try {
        const updateResponses = await Promise.allSettled(securityGroupsToRemove
          .map(async (payload: any) => await userStore.removeUserSecurityGroup({
            userGroupId: payload.userGroupId,
            userId: selectedUser.value.userLoginId,
            fromDate: payload.fromDate,
            thruDate: DateTime.now().toMillis()
          })));

        const createResponses = await Promise.allSettled(securityGroupsToCreate
          .map(async (payload: any) => await userStore.addUserToSecurityGroup({
            userGroupId: payload.userGroupId,
            userId: selectedUser.value.userLoginId
          })));

        const hasFailedResponse = [...updateResponses, ...createResponses].some((response: any) => response.status === "rejected");
        if(hasFailedResponse) {
          commonUtil.showToast(translate("Failed to update some security group(s)."));
        } else {
          commonUtil.showToast(translate("Security group(s) updated successfully."));
        }
        const userGroups = await userStore.getUserGroups(selectedUser.value.userLoginId);
        const now = Date.now();
        const updatedUserSecurityGroups = userGroups.filter((group: any) => !group.thruDate || group.thruDate > now);
        userStore.updateSelectedUser({ ...selectedUser.value, securityGroups: updatedUserSecurityGroups });
        isUserFulfillmentAdmin.value = updatedUserSecurityGroups.length ? await userStore.isUserFulfillmentAdmin(updatedUserSecurityGroups.map((group: any) => group.userGroupId)) : false;
      } catch (error) {
        logger.error(error);
        commonUtil.showToast(translate("Failed to update some security group(s)."));
      }
    }
  });

  return selectSecurityGroupModal.present();
};

const selectProductStore = async () => {
  const selectProductStoreModal = await modalController.create({
    component: SelectProductStoreModal,
    componentProps: { selectedProductStores: userProductStores.value }
  });

  selectProductStoreModal.onDidDismiss().then(async (result) => {
    if(result.data && result.data.value) {
      const productStoresToCreate = result.data.value.productStoresToCreate;
      const productStoresToRemove = result.data.value.productStoresToRemove;

      const updateResponses = await Promise.allSettled(productStoresToRemove
        .map(async (payload: any) => await userStore.updateProductStoreRole({
          partyId: selectedUser.value.partyId,
          productStoreId: payload.productStoreId,
          roleTypeId: payload.roleTypeId,
          fromDate: userProductStores.value.find((store: any) => payload.productStoreId === store.productStoreId).fromDate,
          thruDate: DateTime.now().toMillis()
        })));

      if(productStoresToCreate.length) {
        try {
          const resp = await userStore.ensurePartyRole({
            partyId: selectedUser.value.partyId,
            roleTypeId: "APPLICATION_USER",
          });
          if(commonUtil.hasError(resp)) {
            commonUtil.showToast(translate("Something went wrong."));
            throw resp.data;
          }
        } catch (error) {
          logger.error(error);

          return;
        }
      }

      const createResponses = await Promise.allSettled(productStoresToCreate
        .map(async (payload: any) => await userStore.createProductStoreRole({
          productStoreId: payload.productStoreId,
          partyId: selectedUser.value.partyId,
          roleTypeId: "APPLICATION_USER",
        })));

      const hasFailedResponse = [...updateResponses, ...createResponses].some((response: any) => response.status === "rejected");
      if(hasFailedResponse) {
        commonUtil.showToast(translate("Failed to update some role(s)."));
      } else {
        commonUtil.showToast(translate("Role(s) updated successfully."));
      }
      const updatedUserProductStores = await userStore.getUserProductStores(selectedUser.value.partyId);
      userStore.updateSelectedUser({ ...selectedUser.value, productStores: updatedUserProductStores });
    }
  });

  return selectProductStoreModal.present();
};

const updatePickerRoleStatus = async (event: any) => {
  event.stopImmediatePropagation();
  const isChecked = !event.target.checked;

  try {
    let resp;
    if(isChecked) {
      resp = await userStore.ensurePartyRole({
        partyId: selectedUser.value?.partyId,
        roleTypeId: "WAREHOUSE_PICKER"
      });
    } else {
      resp = await userStore.deletePartyRole({
        partyId: selectedUser.value?.partyId,
        roleTypeId: "WAREHOUSE_PICKER"
      });
    }
    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("User picker role updated successfully."));

      const currentUser = JSON.parse(JSON.stringify(selectedUser.value));
      currentUser.isWarehousePicker = isChecked;
      await userStore.updateSelectedUser(currentUser);
      event.target.checked = isChecked;
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to update user role."));
    logger.error(error);
  }
};

const editName = async () => {
  let inputFields = [{
    name: "firstName",
    value: selectedUser.value.firstName
  },
  {
    name: "lastName",
    value: selectedUser.value.lastName
  }];

  if(selectedUser.value.partyTypeId === "PARTY_GROUP") {
    inputFields = [{
      name: "groupName",
      value: selectedUser.value.groupName
    }];
  }

  const alert = await alertController.create({
    header: translate("Edit name"),
    inputs: inputFields,
    buttons: [{
      text: translate("Cancel"),
      role: "cancel"
    },
    {
      text: translate("Confirm"),
      handler: async (data: any) => {
        if(data.firstName || data.groupName) {
          emitter.emit("presentLoader");

          try {
            const resp = selectedUser.value.partyTypeId === "PARTY_GROUP"
              ? await userStore.updatePartyGroupName({ partyId: selectedUser.value.partyId, groupName: data.groupName })
              : await userStore.updatePartyPersonName({ partyId: selectedUser.value.partyId, firstName: data.firstName, lastName: data.lastName });

            if(!commonUtil.hasError(resp)) {
              commonUtil.showToast(translate("User renamed successfully."));
              await userStore.updateSelectedUser({ ...selectedUser.value, ...data });
            } else {
              throw resp.data;
            }
          } catch (err) {
            logger.error(err);
          }

          emitter.emit("dismissLoader");
        }
      }
    }]
  });

  alert.present();
};

const updateUserStatus = async (event: any) => {
  event.stopImmediatePropagation();

  const isChecked = !event.target.checked;

  const payload = {
    partyId: selectedUser.value.partyId,
    statusId: isChecked ? "PARTY_DISABLED" : "PARTY_ENABLED"
  };

  emitter.emit("presentLoader");

  try {
    if(isChecked && selectedUser.value.userLoginId) {
      await userStore.updateUserLoginStatus({
        userId: selectedUser.value.userLoginId,
        disabled: "Y"
      });
      selectedUser.value.disabled = "Y";
    }
    const resp = await userStore.updatePartyStatus(payload);

    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("User status updated successfully."));
      await userStore.updateSelectedUser({ ...selectedUser.value, ...payload });
      event.target.checked = isChecked;
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error(err);
    commonUtil.showToast(translate("Failed to update user status."));
  }

  emitter.emit("dismissLoader");
};

const validateImageType = (file: any, validImageTypes: string[]): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = document.createElement("img");
      img.onload = () => {
        if(validImageTypes.includes(file.type)) {
          resolve(true);
        } else {
          reject(false);
        }
      };
      img.onerror = () => {
        reject(false);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
};

const uploadImage = async (event: any) => {
  const selectedFile = event.target.files[0];
  if(!selectedFile) {
    return;
  }

  const validImageTypes = ["image/jpeg", "image/png", "image/gif", "image/svg+xml"];
  try {
    await validateImageType(selectedFile, validImageTypes);
  } catch {
    commonUtil.showToast(translate("Please upload a valid image file, supported types: jpg/jpeg, png, gif, svg"));

    return;
  }

  const formData = new FormData();
  formData.append("uploadedFile", selectedFile, selectedFile?.name);
  try {
    const resp = await userStore.uploadPartyImage({ userId: selectedUser.value.userLoginId, formData });
    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Image uploaded successfully."));
      userStore.updateSelectedUser({ ...selectedUser.value, partyImageUrl: resp.data.partyImageUrl });
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to upload image."));
    logger.error("Error uploading image:", error);
  }
};

const getUserFacilities = () => {
  return selectedUser.value.facilities?.filter((facility: any) => facility.roleTypeId === "WAREHOUSE_PICKER") || [];
};

const openUserSecurityGroupAssocHistoryModal = async () => {
  const userSecurityGroupAssocHistoryModal = await modalController.create({
    component: UserSecurityGroupAssocHistoryModal,
  });

  return userSecurityGroupAssocHistoryModal.present();
};
</script>

<style scoped>
.login-detail-actions {
  padding: var(--spacer-xs) 10px 10px;
}

.user-details {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  align-items: start;
}

.profile {
  grid-column: span 2;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacer-xs) 10px 0px;
}

ion-card>ion-button[expand="block"] {
  margin-inline: var(--spacer-sm);
  margin-bottom: var(--spacer-sm);
}

ion-skeleton-text {
  width: 100%;
  height: 40%;
}

@media (min-width: 700px) {
  main {
    margin: var(--spacer-xl);
  }

  .user-details {
    gap: var(--spacer-base);
  }
}

label {
  cursor: pointer;
}
</style>
