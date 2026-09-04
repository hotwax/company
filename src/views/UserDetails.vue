<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-back-button v-if="redirectedFromUrl" slot="start" default-href="/users" @click="goBack($event)" />
        <ion-back-button v-else-if="userStore.hasPermission(Actions.APP_USERS_VIEW)" slot="start" default-href="/users" />
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
                  <p>{{ selectedUser.username }}</p>
                  <ion-badge v-if="selectedUser.userId === userProfile.userId">
                    {{ translate("Your user") }}
                  </ion-badge>
                </ion-label>
                <ion-button fill="outline" :disabled="!userStore.hasPermission(Actions.APP_PARTY_UPDATE)" @click="editName">
                  {{ translate('Edit') }}
                </ion-button>
              </ion-item>
            </div>
            <div v-if="isUserFetched">
              <ion-item
                :detail="canOpenCreatedByUserDetail()"
                :button="canOpenCreatedByUserDetail()"
                @click="openCreatedByUserDetail"
              >
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
                <input id="profilePic" class="ion-hide" type="file" accept="image/*" :disabled="!userStore.hasPermission(Actions.APP_PARTY_UPDATE)" @change="uploadImage" />
                <label for="profilePic">{{ translate("Upload") }}</label>
              </ion-item>
              <ion-item lines="none" :disabled="!userStore.hasPermission(Actions.APP_PARTY_STATUS_UPDATE)">
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
                <ion-toggle :disabled="!userStore.hasPermission(Actions.APP_PARTY_STATUS_UPDATE)" :checked="selectedUser.statusId === 'PARTY_ENABLED'" @click.prevent="updateUserStatus($event)">
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
          <ion-card v-if="isUserFetched || selectedUser.userId">
            <ion-card-header>
              <ion-card-title>
                {{ translate('Login details') }}
              </ion-card-title>
            </ion-card-header>
            <template v-if="selectedUser.userId">
              <ion-list>
                <ion-item>
                  <ion-label>{{ translate('Username') }}</ion-label>
                  <ion-label slot="end">
                    {{ selectedUser.username }}
                  </ion-label>
                </ion-item>
                <ion-item :disabled="!userStore.hasPermission(Actions.APP_SECURITY_CREATE) || selectedUser.statusId !== 'PARTY_ENABLED'">
                  <ion-toggle :checked="selectedUser.disabled == 'Y'" @click.prevent="updateUserLoginStatus($event)">
                    {{ translate("Block login") }}
                  </ion-toggle>
                </ion-item>
              </ion-list>
              <div class="login-detail-actions">
                <ion-button :disabled="!userStore.hasPermission(Actions.APP_SECURITY_CREATE) && selectedUser.userId !== userProfile.userId" fill="outline" color="warning" @click="openResetPasswordModal()">
                  {{ translate('Reset password') }}
                </ion-button>
                <ion-button :disabled="!userStore.hasPermission(Actions.APP_SECURITY_CREATE) || selectedUser.hasLoggedOut === 'Y'" fill="outline" color="danger" @click="confirmForceLogout()">
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
              <ion-button :disabled="!userStore.hasPermission(Actions.APP_SECURITY_CREATE)" fill="outline" expand="block" @click="createNewUserLogin()">
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
                <ion-button v-else slot="end" size="default" fill="clear" :disabled="!userStore.hasPermission(Actions.APP_CONTACT_CREATE)" @click="addContactField('email')">
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
                <ion-button v-else slot="end" size="default" fill="clear" :disabled="!userStore.hasPermission(Actions.APP_CONTACT_CREATE)" @click="addContactField('phoneNumber')">
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
                <ion-button v-else slot="end" size="default" fill="clear" :disabled="!userStore.hasPermission(Actions.APP_PARTY_UPDATE)" @click="addContactField('externalId')">
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
                <ion-button v-if="userSecurityGroups.length" :disabled="!userStore.hasPermission(Actions.APP_SECURITY_GROUP_ASSIGN) || !selectedUser.userId" @click="selectSecurityGroup()">
                  {{ translate('Add') }}
                  <ion-icon slot="end" :icon="addCircleOutline" />
                </ion-button>
              </ion-list-header>
              <ion-button v-if="!userSecurityGroups.length" :disabled="!userStore.hasPermission(Actions.APP_SECURITY_GROUP_ASSIGN) || !selectedUser.userId" fill="outline" expand="block" class="ion-margin" @click="selectSecurityGroup()">
                <ion-icon slot="start" :icon="addOutline" />
                {{ translate('Add to security group') }}
              </ion-button>
              <ion-item v-if="!selectedUser.userId">
                <ion-label>{{ translate('Security groups can only be assigned after a login is created. Please add login credentials for above.') }}</ion-label>
              </ion-item>
              <ion-item v-else>
                <ion-label>{{ translate("View history") }}</ion-label>
                <ion-button slot="end" size="default" fill="clear" color="medium" @click="openUserSecurityGroupAssocHistoryModal()">
                  <ion-icon slot="icon-only" :icon="timeOutline" />
                </ion-button>
              </ion-item>

              <template v-if="!userStore.hasPermission(Actions.APP_WEBTOOLS_VIEW) && checkUserAssociatedSecurityGroup('SUPER')">
                <ion-item lines="none" :disabled="true">
                  <ion-label>{{ translate('Super') }}</ion-label>
                  <ion-button slot="end" size="default" fill="clear" color="medium">
                    <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                  </ion-button>
                </ion-item>
              </template>
              <template v-else>
                <ion-item v-for="securityGroup in userSecurityGroups" :key="securityGroup.userGroupId" :disabled="!userStore.hasPermission(Actions.APP_SECURITY_GROUP_ASSIGN)">
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
                <ion-button v-if="userProductStores.length" :disabled="!userStore.hasPermission(Actions.APP_SECURITY_CREATE)" @click="selectProductStore()">
                  {{ translate('Add') }}
                  <ion-icon slot="end" :icon="addCircleOutline" />
                </ion-button>
              </ion-list-header>

              <ion-button v-if="!userProductStores.length" :disabled="!userStore.hasPermission(Actions.APP_SECURITY_CREATE)" fill="outline" expand="block" class="ion-margin" @click="selectProductStore()">
                <ion-icon slot="start" :icon="addOutline" />
                {{ translate('Add to a product store') }}
              </ion-button>

              <ion-item v-for="store in userProductStores" :key="store.productStoreId" :disabled="!userStore.hasPermission(Actions.APP_SECURITY_CREATE)">
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
              <ion-item :disabled="!userStore.hasPermission(Actions.APP_FACILITY_ASSIGNMENT_UPDATE)">
                <ion-toggle :checked="selectedUser?.isWarehousePicker" @click.prevent="updatePickerRoleStatus($event)">
                  {{ translate("Show as picker") }}
                </ion-toggle>
              </ion-item>
              <ion-item v-if="isUserFulfillmentAdmin">
                <ion-label>{{ translate("This user has 'STOREFULFILLMENT_ADMIN' permission, enabling access to all facilities.") }}</ion-label>
              </ion-item>
              <ion-item lines="none" button detail :disabled="!userStore.hasPermission(Actions.APP_FACILITY_ASSIGNMENT_UPDATE) || checkUserAssociatedSecurityGroup('INTEGRATION')" @click="selectFacility()">
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
                <ion-select :label="translate('Product store')" interface="popover" :value="selectedUser.favoriteProductStorePref?.preferenceValue ? selectedUser.favoriteProductStorePref?.preferenceValue : ''" :disabled="!selectedUser?.userId" @ion-change="updateFavoriteProductStore($event)">
                  <ion-select-option v-for="productStore in userProductStores" :key="productStore.productStoreId" :value="productStore.productStoreId">
                    {{ productStore.storeName || productStore.productStoreId }}
                  </ion-select-option>
                  <ion-select-option value="">
                    {{ translate("None") }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item lines="none">
                <ion-select :label="translate('Shopify shop')" interface="popover" :value="selectedUser.favoriteShopifyShopPref?.preferenceValue ? selectedUser.favoriteShopifyShopPref?.preferenceValue : ''" :disabled="!selectedUser?.userId" @ion-change="updateFavoriteShopifyShop($event)">
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

      <ion-modal :is-open="showResetPasswordModal" @didDismiss="closeResetPasswordModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeResetPasswordModal">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Reset password") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-list>
            <ion-item lines="none">
              <p>
                {{ translate('Password should be at least 5 characters long and contain at least one number, alphabet and special character.') }}
              </p>
            </ion-item>
            <ion-item lines="none">
              <ion-input
                id="newPassword"
                ref="newPasswordRef"
                v-model="newPassword"
                :label="translate('New password')"
                :placeholder="translate('Enter password')"
                name="password"
                :type="showNewPassword ? 'text' : 'password'"
                :error-text="translate('Password requirements not fulfilled.')"
                autocomplete="new-password"
                @keyup="validateResetPassword"
                @ion-blur="markResetPasswordTouched"
              />
            </ion-item>
            <ion-item lines="none">
              <ion-input
                id="confirmPassword"
                ref="confirmPasswordInput"
                v-model="confirmPassword"
                :label="translate('Verify password')"
                :placeholder="translate('Confirm password')"
                name="confirmPassword"
                :type="showConfirmPassword ? 'text' : 'password'"
                :error-text="translate('Passwords do not match.')"
                @keyup="validateConfirmPassword()"
                @ion-blur="markConfirmPasswordTouched"
              />
            </ion-item>
          </ion-list>

          <ion-item v-if="resetPasswordEmail?.length" class="ion-padding-top">
            <ion-label>{{ resetPasswordEmail }}</ion-label>
            <ion-button slot="end" fill="clear" @click="sendResetPasswordEmail()">
              {{ translate('Reset password email') }}
              <ion-icon slot="end" :icon="mailOutline" />
            </ion-button>
          </ion-item>

          <ion-fab slot="fixed" vertical="bottom" horizontal="end">
            <ion-fab-button :disabled="(!userStore.hasPermission(Actions.APP_SECURITY_CREATE) && userProfile?.userLoginId !== resetPasswordUserLoginId) || checkResetButtonStatus()" @click="resetPassword()">
              <ion-icon :icon="lockClosedOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="showSelectSecurityGroupModal" @didDismiss="closeSelectSecurityGroupModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeSelectSecurityGroupModal">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Select security groups") }}</ion-title>
          </ion-toolbar>
          <ion-toolbar>
            <ion-searchbar v-model="queryString" :placeholder="translate('Search security groups')" />
          </ion-toolbar>
        </ion-header>

        <ion-content class="select-security-group-content">
          <template v-if="filteredSecurityGroups.length">
            <ion-list>
              <ion-item v-for="securityGroup in filteredSecurityGroups" :key="securityGroup.userGroupId">
                <ion-checkbox :checked="isSelected(securityGroup.userGroupId)" @ion-change="toggleSecurityGroupSelection(securityGroup)">
                  <ion-label>
                    {{ securityGroup.description || securityGroup.userGroupId }}
                    <p>{{ securityGroup.userGroupId }}</p>
                  </ion-label>
                </ion-checkbox>
              </ion-item>
            </ion-list>
          </template>
          <div v-else class="empty-state">
            <p>{{ translate("No security groups found") }}</p>
          </div>

          <ion-fab slot="fixed" vertical="bottom" horizontal="end" @click="saveSecurityGroups()">
            <ion-fab-button>
              <ion-icon :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>

      <ion-modal :is-open="showUserSecurityGroupAssocHistoryModal" @didDismiss="closeUserSecurityGroupAssocHistoryModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeUserSecurityGroupAssocHistoryModal">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Security group history") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-list v-if="userGroupAssocHistories.length">
            <ion-item v-for="assocHistory in userGroupAssocHistories" :key="assocHistory.userGroupId">
              <ion-label>
                {{ assocHistory.description ? assocHistory.description : assocHistory.userGroupId }}
                <p>{{ assocHistory.userGroupId }}</p>
              </ion-label>
              <ion-note slot="end">
                {{ commonUtil.getDateWithOrdinalSuffix(assocHistory.fromDate) }} - {{ assocHistory.thruDate ? commonUtil.getDateWithOrdinalSuffix(assocHistory.thruDate) : translate('Current') }}
              </ion-note>
            </ion-item>
          </ion-list>
          <div v-else class="empty-state">
            <p>{{ translate("No history found.") }}</p>
          </div>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IonAvatar, IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonContent, IonFab, IonFabButton, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList, IonListHeader, IonModal, IonNote, IonPage, IonSearchbar, IonSelect, IonSelectOption, IonSkeletonText, IonSpinner, IonText, IonTitle, IonToggle, IonToolbar, alertController, modalController, onIonViewWillEnter, onIonViewWillLeave, popoverController } from "@ionic/vue";
import router from "@/router";
import { useUserStore } from "@/store/user";
import { addCircleOutline, addOutline, bodyOutline, businessOutline, callOutline, cameraOutline, closeOutline, cloudyNightOutline, ellipsisVerticalOutline, eyeOffOutline, eyeOutline, lockClosedOutline, mailOutline, saveOutline, timeOutline } from "ionicons/icons";
import { commonUtil, emitter, logger, translate } from "@common";
import { isValidPhone } from "@/utils";
import { useUserGroups } from '@/composables/useSecurity';
import { useShopifyShops } from '@/composables/useShopify';
import { useRoleTypes } from '@/composables/useSeed';
import ContactActionsPopover from "@/components/common/ContactActionsPopover.vue";
import ProductStoreActionsPopover from "@/components/product-store/ProductStoreActionsPopover.vue";
import SecurityGroupActionsPopover from "@/components/security/SecurityGroupActionsPopover.vue";
import SelectFacilityModal from "@/components/facility/SelectFacilityModal.vue";
import SelectProductStoreModal from "@/components/product-store/SelectProductStoreModal.vue";
import { DateTime } from "luxon";
import Image from "@/components/common/Image.vue";
import Actions from "@/authorization/actions";

const props = defineProps({
  partyId: {
    type: String,
    required: true
  }
});

const userStore = useUserStore();

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
const isUserFulfillmentAdmin = ref(false);

const selectedUser = computed(() => userStore.selectedUser);
const userProductStores = computed(() => userStore.getSelectedUserProductStores);
const userSecurityGroups = computed(() => userStore.getSelectedUserSecurityGroups);
// Role types are cached at login; this used to depend on `prefetchReferenceData` having run.
const { descriptionById: roleTypeDescriptions } = useRoleTypes();
const getRoleTypeDesc = (roleTypeId: string) => roleTypeDescriptions.value[roleTypeId] ?? roleTypeId;
const userProfile = computed(() => userStore.getUserProfile);
// Cached, reactive — no fetch needed. The favorites card scopes shops by the favorite product
// store; that scope lives in a ref and the list is a computed (not an imperative snapshot) so it
// also fills in when the cached shop table hydrates after view entry.
const { shops: shopifyShops } = useShopifyShops();
const shopsProductStoreId = ref("");
const shopifyShopsForProductStore = computed(() =>
  shopifyShops.value.filter((shopifyShop: any) => shopifyShop.productStoreId === shopsProductStoreId.value));
const redirectedFromUrl = computed(() => userStore.getRedirectedFromUrl);
// Bumped on successful upload so the <img> URL changes and the browser doesn't keep showing the old cached image.
const imageVersion = ref(0);
const imageUrl = computed(() => {
  const versionParam = imageVersion.value ? `?v=${imageVersion.value}` : "";

  return `${commonUtil.getMaargURL()}admin/users/${selectedUser.value.userId}/profileImage${versionParam}`;
});

// Reset password modal
const showResetPasswordModal = ref(false);
const resetPasswordEmail = ref<string | undefined>("");
const resetPasswordUserLoginId = ref<string | undefined>("");
const newPassword = ref("");
const confirmPassword = ref("");
const showConfirmPassword = ref(false);
const showNewPassword = ref(false);
const newPasswordRef = ref<any>(null);
const confirmPasswordInput = ref<any>(null);

// Select security group modal
const showSelectSecurityGroupModal = ref(false);
const queryString = ref("");
const selectedSecurityGroupsProp = ref<any[]>([]);
const selectedSecurityGroupValues = ref<any[]>([]);
// Cached, reactive — no fetch needed. This app only ever manages login-capable groups, and the
// cache holds EVERY group (framework/system ones like UgtMoquiAdmin included), so the old
// server-side UgtUserAccess scope is kept client-side.
const { userGroups: cachedUserGroups } = useUserGroups();
const securityGroups = computed(() => cachedUserGroups.value.filter((group: any) => group.groupTypeEnumId === "UgtUserAccess"));
const filteredSecurityGroups = computed(() => {
  const query = queryString.value.toLowerCase();
  if(!query) {return securityGroups.value;}

  return securityGroups.value.filter((securityGroup: any) => {
    return securityGroup.userGroupId.toLowerCase().includes(query) ||
        (securityGroup.description && securityGroup.description.toLowerCase().includes(query));
  });
});

// User security group association history modal
const showUserSecurityGroupAssocHistoryModal = ref(false);
const userGroupAssocHistories = ref<any[]>([]);

onIonViewWillLeave(async () => {
  await userStore.updateRedirectedFromUrl("");
});

onIonViewWillEnter(async () => {
  isUserFetched.value = false;
  await userStore.getSelectedUserDetails({ partyId: props.partyId, isFetchRequired: true });
  const productStoreId = selectedUser.value.favoriteProductStorePref?.preferenceValue;
  if(productStoreId) {
    getShopifyShops(productStoreId);
  }
  isUserFulfillmentAdmin.value = selectedUser.value.securityGroups?.length ? await userStore.isUserFulfillmentAdmin(selectedUser.value.securityGroups.map((group: any) => group.userGroupId)) : false;
  isUserFetched.value = true;
  username.value = selectedUser.value.groupName ? (selectedUser.value.groupName)?.toLowerCase() : [selectedUser.value.firstName, selectedUser.value.lastName].filter(Boolean).join(".").toLowerCase();
});

const checkUserAssociatedSecurityGroup = (securityGroupId: any) => {
  return userSecurityGroups.value?.some((userSecurityGroup: any) => userSecurityGroup.userGroupId === securityGroupId);
};

const getShopifyShops = (productStoreId: string) => {
  shopsProductStoreId.value = productStoreId;
};

const updateFavoriteProductStore = (event: any) => {
  const selectedProductStoreId = event.target.value;
  if(selectedProductStoreId && selectedProductStoreId !== selectedUser.value?.favoriteProductStorePref?.preferenceValue) {
    userStore.setFavoriteProductStore({ "userId": selectedUser.value?.userId, "productStoreId": selectedProductStoreId })
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
    userStore.setFavoriteShopifyShop({ "userId": selectedUser.value?.userId, "shopId": selectedShopId })
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

const isCreatedBySystem = () => {
  return !selectedUser.value.createdByUserLogin || selectedUser.value.createdByUserLogin === "system";
};

const canOpenCreatedByUserDetail = () => {
  return !isCreatedBySystem() && Boolean(selectedUser.value.createdByUserPartyId);
};

const openCreatedByUserDetail = () => {
  if(!canOpenCreatedByUserDetail()) {return;}

  router.push({ path: `/user-details/${selectedUser.value.createdByUserPartyId}` });
};

const addContactField = async (type: string) => {
  const inputType = type === "email" ? "email" : (type === "phoneNumber" ? "tel" : "text");

  const contactUpdateAlert = await alertController.create({
    header: translate(OPTIONS[type as "email" | "phoneNumber" | "externalId"].header),
    inputs: [{
      name: "input",
      type: inputType,
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
            if(!isValidPhone(input)) {
              commonUtil.showToast(translate("Invalid phone number."));

              return false;
            }

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
          if(type === "email" || type === "phoneNumber") {
            await userStore.indexEmployee(selectedUser.value.partyId);
          }
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
    const resp = await userStore.createUserAccount({
      partyId: selectedUser.value.partyId,
      username: username.value,
      newPassword: password.value,
      newPasswordVerify: password.value,
    });
    if(!commonUtil.hasError(resp)) {
      await userStore.getSelectedUserDetails({ partyId: selectedUser.value.partyId, isFetchRequired: true });
      await userStore.indexEmployee(selectedUser.value.partyId);
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Something went wrong."));
    logger.error(error);
  }
};

const inputElement = (inputRef: any) => inputRef.value?.$el || inputRef.value;

const openResetPasswordModal = () => {
  resetPasswordEmail.value = selectedUser.value.emailDetails?.email;
  resetPasswordUserLoginId.value = selectedUser.value.userId;
  newPassword.value = "";
  confirmPassword.value = "";
  showNewPassword.value = false;
  showConfirmPassword.value = false;
  showResetPasswordModal.value = true;
};

const closeResetPasswordModal = () => {
  showResetPasswordModal.value = false;
};

const resetPassword = async () => {
  try {
    const resp = await userStore.resetPassword({
      userId: resetPasswordUserLoginId.value as string,
      newPassword: newPassword.value,
      newPasswordVerify: confirmPassword.value
    });
    // update#Password reports failures (wrong/missing old password, no permission, weak password) as a public
    // "danger" message with updateSuccessful: false, not as commonUtil.hasError's generic error shape.
    if(!commonUtil.hasError(resp) && resp.data?.updateSuccessful) {
      commonUtil.showToast(translate("Password reset successful."));
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to reset password."));
    logger.error(error);
  }
  closeResetPasswordModal();
};

const checkResetButtonStatus = () => {
  return ((!newPassword.value.length || !confirmPassword.value.length) ||
    (newPassword.value !== confirmPassword.value) ||
    (!commonUtil.isValidPassword(newPassword.value) || !commonUtil.isValidPassword(confirmPassword.value)));
};

const validateResetPassword = (event: any) => {
  const value = event.target.value;
  const element = inputElement(newPasswordRef);
  element?.classList.remove("ion-valid");
  element?.classList.remove("ion-invalid");

  if(value === "") {return;}

  if(commonUtil.isValidPassword(value)) {
    element?.classList.add("ion-valid");
  } else {
    element?.classList.add("ion-invalid");
  }
};

const validateConfirmPassword = () => {
  const element = inputElement(confirmPasswordInput);
  element?.classList.remove("ion-valid");
  element?.classList.remove("ion-invalid");

  if(newPassword.value === confirmPassword.value) {
    element?.classList.add("ion-valid");
  } else {
    element?.classList.add("ion-invalid");
  }
};

const sendResetPasswordEmail = async () => {
  try {
    const resp = await userStore.sendResetPasswordEmail({
      emailAddress: resetPasswordEmail.value,
      userName: resetPasswordUserLoginId.value
    });
    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Password reset email sent successfully."));
    } else {
      throw resp.data;
    }
  } catch (error) {
    commonUtil.showToast(translate("Failed to send password reset email."));
    logger.error(error);
  }
  closeResetPasswordModal();
};

const markResetPasswordTouched = () => {
  inputElement(newPasswordRef)?.classList.add("ion-touched");
};

const markConfirmPasswordTouched = () => {
  inputElement(confirmPasswordInput)?.classList.add("ion-touched");
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
      userId: selectedUser.value.userId
    });
    if(commonUtil.hasError(resp)) {
      throw resp;
    }
    await userStore.getSelectedUserDetails({ partyId: props.partyId, isFetchRequired: true });
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
            userId: selectedUser.value.userId,
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

const selectSecurityGroup = () => {
  selectedSecurityGroupsProp.value = userSecurityGroups.value;
  selectedSecurityGroupValues.value = JSON.parse(JSON.stringify(userSecurityGroups.value || []));
  queryString.value = "";
  showSelectSecurityGroupModal.value = true;
};

const closeSelectSecurityGroupModal = () => {
  showSelectSecurityGroupModal.value = false;
};

const saveSecurityGroups = async () => {
  const securityGroupsToCreate = selectedSecurityGroupValues.value.filter((selectedGroup: any) => !selectedSecurityGroupsProp.value.some((group: any) => group.userGroupId === selectedGroup.userGroupId));
  const securityGroupsToRemove = selectedSecurityGroupsProp.value.filter((group: any) => !selectedSecurityGroupValues.value.some((selectedGroup: any) => group.userGroupId === selectedGroup.userGroupId));

  try {
    const updateResponses = await Promise.allSettled(securityGroupsToRemove
      .map(async (payload: any) => await userStore.removeUserSecurityGroup({
        userGroupId: payload.userGroupId,
        userId: selectedUser.value.userId,
        fromDate: payload.fromDate,
        thruDate: DateTime.now().toMillis()
      })));

    const createResponses = await Promise.allSettled(securityGroupsToCreate
      .map(async (payload: any) => await userStore.addUserToSecurityGroup({
        userGroupId: payload.userGroupId,
        userId: selectedUser.value.userId,
        fromDate: DateTime.now().toMillis()
      })));

    const hasFailedResponse = [...updateResponses, ...createResponses].some((response: any) => response.status === "rejected");
    if(hasFailedResponse) {
      commonUtil.showToast(translate("Failed to update some security group(s)."));
    } else {
      commonUtil.showToast(translate("Security group(s) updated successfully."));
    }
    const userGroups = await userStore.getUserGroups(selectedUser.value.userId);
    const now = Date.now();
    const updatedUserSecurityGroups = userGroups.filter((group: any) => !group.thruDate || group.thruDate > now);
    userStore.updateSelectedUser({ ...selectedUser.value, securityGroups: updatedUserSecurityGroups });
    isUserFulfillmentAdmin.value = updatedUserSecurityGroups.length ? await userStore.isUserFulfillmentAdmin(updatedUserSecurityGroups.map((group: any) => group.userGroupId)) : false;
    await userStore.indexEmployee(selectedUser.value.partyId);
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(translate("Failed to update some security group(s)."));
  }
  closeSelectSecurityGroupModal();
};

const toggleSecurityGroupSelection = (updatedSecurityGroup: any) => {
  const selectedGroup = selectedSecurityGroupValues.value.some((group :any) => group.userGroupId === updatedSecurityGroup.userGroupId);
  if(selectedGroup) {
    selectedSecurityGroupValues.value = selectedSecurityGroupValues.value.filter((group :any) => group.userGroupId !== updatedSecurityGroup.userGroupId);
  } else {
    selectedSecurityGroupValues.value.push(updatedSecurityGroup);
  }
};

const isSelected = (securityGroupId: any) => {
  return selectedSecurityGroupValues.value.some((securityGroup :any) => securityGroup.userGroupId === securityGroupId);
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
              await userStore.indexEmployee(selectedUser.value.partyId);
            } else {
              throw resp.data;
            }
          } catch (err) {
            commonUtil.showToast(translate("Failed to rename user."));
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
    if(isChecked && selectedUser.value.userId) {
      await userStore.updateUserLoginStatus({
        userId: selectedUser.value.userId,
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
    const resp = await userStore.uploadPartyImage({ userId: selectedUser.value.userId, formData });
    if(!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Image uploaded successfully."));
      imageVersion.value = resp.data.contentId ?? Date.now();
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

const openUserSecurityGroupAssocHistoryModal = () => {
  userGroupAssocHistories.value = [];
  showUserSecurityGroupAssocHistoryModal.value = true;
  fetchUserSecurityGroupAssoHistory();
};

const closeUserSecurityGroupAssocHistoryModal = () => {
  showUserSecurityGroupAssocHistoryModal.value = false;
};

const fetchUserSecurityGroupAssoHistory = async () => {
  if(!selectedUser.value.userId) {return;}

  let histories = [] as any;
  try {
    histories = await userStore.getUserGroups(selectedUser.value.userId);
    const currentSecurityGroups = histories.filter((history: any) => !history.thruDate);
    const expiredSecurityGroups = histories.filter((history: any) => history.thruDate);
    histories = currentSecurityGroups.concat(expiredSecurityGroups);
  } catch (error: any) {
    console.error(error);
  }
  userGroupAssocHistories.value = histories;
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

.select-security-group-content {
  --padding-bottom: 80px;
}
</style>
