<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-back-button slot="start" default-href="/facilities/find"/>
        <ion-title>{{ translate("Facility details") }}</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      <main v-if="isLoading">
        <div class="facility-info">
          <ion-card class="facility-info facility-details">
            <ion-skeleton-text animated style="width: 40%; height: 20px; margin: 16px;" />
            <ion-skeleton-text animated style="width: 60%; height: 28px; margin: 16px;" />
            <ion-skeleton-text animated style="width: 80%; height: 20px; margin: 16px;" />
          </ion-card>
        </div>
        <section>
          <ion-card v-for="n in 4" :key="n">
            <ion-skeleton-text animated style="width: 50%; height: 20px; margin: 16px;" />
            <ion-skeleton-text animated style="width: 90%; height: 16px; margin: 16px;" />
            <ion-skeleton-text animated style="width: 70%; height: 16px; margin: 16px;" />
          </ion-card>
        </section>
      </main>

      <main v-else-if="current?.facilityId">
        <div class="facility-info">
          <ion-card class="facility-info facility-details">
            <ion-item lines="none" class="ion-margin-top">
              <ion-label>
                <p class="overline">{{ current.facilityId }}</p>
                <h1>{{ current.facilityName }}</h1>
              </ion-label>
              <ion-button @click="renameFacility()" fill="outline">{{ translate('Edit') }}</ion-button>
            </ion-item>

            <div class="ion-margin-top">
              <ion-item>
                <ion-icon :icon="bookmarkOutline" slot="start"/>
                <ion-select :label="translate('Facility Type')" interface="popover" v-model="parentFacilityTypeId" @ionChange="getFacilityTypesByParentTypeId()">
                  <ion-select-option value="PHYSICAL_STORE">{{ translate('Physical Store') }}</ion-select-option>
                  <ion-select-option value="DISTRIBUTION_CENTER">{{ translate('Distribution Center') }}</ion-select-option>
                </ion-select>
              </ion-item>

              <ion-item>
                <ion-icon :icon="bookmarksOutline" slot="start"/>
                <ion-select :label="translate('Facility SubType')" interface="popover" v-model="facilityTypeId" @ionChange="updateFacilityType()">
                  <ion-select-option v-for="(type, fTypeId) in facilityTypeIdOptions" :key="fTypeId" :value="fTypeId">{{ type.description ? type.description : fTypeId }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item lines="none" class="ion-margin-bottom">
                <ion-icon :icon="lockClosedOutline" slot="start"/>
                <ion-toggle :checked="!!current.closedDate" @click.prevent="closeFacility($event)">{{ translate('Permanently Closed') }}</ion-toggle>
              </ion-item>
            </div>
          </ion-card>
        </div>

        <section>
          <div>
            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ translate("Address and contact details") }}
                </ion-card-title>
              </ion-card-header>
              <template v-if="postalAddress?.address1">
                <ion-item lines="full">
                  <ion-label>
                    <h3>{{ postalAddress.toName }}</h3>
                    <h3>{{ postalAddress.address1 }}</h3>
                    <h3>{{ postalAddress.address2 }}</h3>
                    <p class="ion-text-wrap">{{ postalAddress.postalCode ? `${postalAddress.city}, ${postalAddress.postalCode}` : postalAddress.city }}</p>
                    <p class="ion-text-wrap">{{ postalAddress.countryGeoName ? `${postalAddress.stateGeoName}, ${postalAddress.countryGeoName}` : postalAddress.stateGeoName }}</p>
                    <p class="ion-text-wrap" v-if="contactDetails?.telecomNumber?.contactNumber">{{ [contactDetails.telecomNumber.countryCode, contactDetails.telecomNumber.contactNumber].filter(Boolean).join('-') }}</p>
                    <p class="ion-text-wrap" v-if="contactDetails?.emailAddress">{{ contactDetails.emailAddress?.infoString }}</p>
                  </ion-label>
                </ion-item>
                <ion-button fill="clear" @click="openAddressModal">{{ translate("Edit") }}</ion-button>
              </template>
              <ion-button v-else expand="block" fill="outline" @click="openAddressModal">
                {{ translate("Add") }}
                <ion-icon slot="end" :icon="addCircleOutline" />
              </ion-button>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ translate("Latitude & Longitude") }}
                </ion-card-title>
              </ion-card-header>
              <template v-if="postalAddress?.latitude || postalAddress?.latitude == 0">
                <ion-card-content>
                  {{ translate("These values are used to help customers lookup how close they are to your stores when they are finding nearby stores.") }}
                </ion-card-content>
                <ion-item lines="full">
                  <ion-label>
                    <p>{{ translate("Facility zipcode") }}</p>
                  </ion-label>
                  <ion-label slot="end"><ion-text :color="isRegenerationRequired ? 'danger' : ''">{{ postalAddress.postalCode }}</ion-text></ion-label>
                </ion-item>
                <ion-item lines="full">
                  <ion-label>
                    <p>{{ translate("Latitude") }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ postalAddress.latitude }}</ion-label>
                </ion-item>
                <ion-item lines="full">
                  <ion-label>
                    <p>{{ translate("Longitude") }}</p>
                  </ion-label>
                  <ion-label slot="end">{{ postalAddress.longitude }}</ion-label>
                </ion-item>
                <div class="actions">
                  <ion-button fill="clear" :disabled="!postalAddress.address1" @click="openGeoPointModal">{{ translate("Edit") }}</ion-button>
                  <ion-button slot="end" fill="clear" color="medium" @click="openLatLongPopover">
                    <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                  </ion-button>
                </div>
              </template>
              <ion-button v-else expand="block" fill="outline" :disabled="!postalAddress.address1" @click="openGeoPointModal">
                {{ translate("Add") }}
                <ion-icon slot="end" :icon="addCircleOutline" />
              </ion-button>
            </ion-card>
          </div>

          <ion-card v-if="!facilityCalendar?.calendarId">
            <ion-card-header>
              <ion-card-title>
                {{ translate("Operating hours") }}
              </ion-card-title>
            </ion-card-header>
            <ion-item lines="none">
              <ion-label>
                <p class="overline">{{ translate("Selected TimeZone") }}</p>
                {{ current?.facilityTimeZone || '-' }}
                <p v-if="current?.facilityTimeZone">{{ getCurrentTime(current?.facilityTimeZone) }}</p>
              </ion-label>
              <ion-button slot="end" fill="outline" color="dark" @click="openTimeZoneModal">{{ translate(current?.facilityTimeZone ? "Change" : "Add") }}</ion-button>
            </ion-item>
            <ion-card-content>
              {{ translate("Select a saved calendar of store hours or create a new calendar") }}
            </ion-card-content>
            <ion-radio-group v-model="selectedCalendarId">
              <ion-item v-for="(calendar, index) in calendars.slice(0, 3)" :key="index" lines="none">
                <ion-radio :value="calendar.calendarId">
                  <div class="ion-text-wrap">{{ calendar.description ? calendar.description : calendar.calendarId }}</div>
                </ion-radio>
              </ion-item>
            </ion-radio-group>
            <ion-item button lines="none" v-if="calendars?.length > 3" @click="addOperatingHours">
              <ion-label>{{ calendars.length - 3 }} {{ translate("Others") }}</ion-label>
              <ion-icon slot="end" :icon="chevronForwardOutline" />
            </ion-item>
            <ion-item button lines="none" @click="addCustomSchedule">
              <ion-label>{{ translate("Custom schedule") }}</ion-label>
              <ion-icon slot="end" color="primary" :icon="addCircleOutline" />
            </ion-item>
            <ion-button fill="outline" expand="block" :disabled="!selectedCalendarId" @click="associateCalendarToFacility">
              {{ translate("Add operating hours") }}
              <ion-icon slot="end" :icon="addCircleOutline" />
            </ion-button>
          </ion-card>

          <ion-card v-else>
            <ion-card-header>
              <div>
                <p class="overline">{{ translate("Operating hours") }}</p>
                <ion-card-title>{{ facilityCalendar.description || facilityCalendar.calendarId }}</ion-card-title>
              </div>
              <ion-button color="medium" fill="clear" class="ion-no-padding" @click="openOperatingHoursPopover($event)">
                <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
              </ion-button>
            </ion-card-header>
            <ion-item lines="none">
              <ion-label>
                <p class="overline">{{ translate("Selected TimeZone") }}</p>
                {{ current?.facilityTimeZone || '-' }}
                <p v-if="current?.facilityTimeZone">{{ getCurrentTime(current?.facilityTimeZone) }}</p>
              </ion-label>
              <ion-button slot="end" fill="outline" color="dark" @click="openTimeZoneModal">{{ translate(current?.facilityTimeZone ? "Change" : "Add") }}</ion-button>
            </ion-item>
            <ion-list lines="none">
              <ion-item v-for="day in days" :key="day">
                <ion-label>
                  <p>{{ translate(day.charAt(0).toUpperCase() + day.slice(1)) }}</p>
                </ion-label>
                <ion-label slot="end">
                  <p>{{ facilityCalendar[day+'StartTime'] ? getOpenEndTime(facilityCalendar[day+'StartTime'], facilityCalendar[day+'Capacity']) : translate('Closed') }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card>

          <div>
            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ translate("Product Stores") }}
                </ion-card-title>
                <ion-button v-if="facilityProductStores?.length" @click="selectProductStores" fill="clear">
                  <ion-icon :icon="addCircleOutline" slot="end" />
                  {{ translate("Add") }}
                </ion-button>
              </ion-card-header>
              <ion-item v-for="store in facilityProductStores" :key="store.productStoreId">
                <ion-label>{{ store.storeName || store.productStoreId }}</ion-label>
                <ion-button slot="end" fill="clear" color="medium" @click="productStorePopover($event, store)">
                  <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
                </ion-button>
              </ion-item>
              <ion-button v-if="!facilityProductStores?.length" expand="block" fill="outline" @click="selectProductStores">
                {{ translate("Add") }}
                <ion-icon slot="end" :icon="addCircleOutline" />
              </ion-button>
            </ion-card>

            <ion-card>
              <ion-card-header>
                <ion-card-title>
                  {{ translate('Map Link') }}
                </ion-card-title>
              </ion-card-header>
              <template v-if="contactDetails?.googleMapUrl?.infoString">
                <ion-item lines="full">
                  <ion-label>{{ contactDetails.googleMapUrl.infoString }}</ion-label>
                </ion-item>
                <div class="actions">
                  <ion-button fill="clear" @click="editMapUrl">{{ translate('Edit') }}</ion-button>
                  <ion-button fill="clear" :href="contactDetails.googleMapUrl.infoString" target="_blank">
                    {{ translate('Preview') }}
                    <ion-icon slot="end" :icon="openOutline" />
                  </ion-button>
                  <ion-button fill="clear" color="danger" @click="deleteMapUrl">{{ translate('Remove') }}</ion-button>
                </div>
              </template>
              <ion-button v-else fill="clear" @click="editMapUrl">
                {{ translate('Add') }}
              </ion-button>
            </ion-card>
          </div>
        </section>

        <section>
          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ translate("Fulfillment Settings") }}
              </ion-card-title>
            </ion-card-header>
            <ion-item>
              <ion-toggle :checked="current.allowPickup" @click.prevent="updateFulfillmentSetting($event, 'PICKUP')">{{ translate("Allow pickup") }}</ion-toggle>
            </ion-item>
            <ion-item>
              <ion-toggle :checked="current.useOMSFulfillment" @click.prevent="updateFulfillmentSetting($event, 'OMS_FULFILLMENT')">{{ translate("Uses native fulfillment app") }}</ion-toggle>
            </ion-item>
            <ion-item>
              <ion-toggle :checked="current.generateShippingLabel" @click.prevent="updateFulfillmentSetting($event, 'AUTO_SHIPPING_LABEL')">{{ translate("Generate shipping labels") }}</ion-toggle>
            </ion-item>
            <ion-item lines="full">
              <ion-input :label="translate('Days to ship')" v-model="defaultDaysToShip" type="number" min="0" :placeholder="translate('days to ship')"/>
            </ion-item>
            <ion-button fill="outline" expand="block" @click="updateDefaultDaysToShip">
              {{ translate("Update days to ship") }}
            </ion-button>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ translate("Sell inventory online") }}
              </ion-card-title>
              <ion-button v-if="associatedInventoryGroups.length" @click="openCreateInventoryGroupModal()" fill="clear">
                <ion-icon :icon="addCircleOutline" slot="end" />
                {{ translate("Add") }}
              </ion-button>
            </ion-card-header>
            <ion-card-content>
              {{ inventoryGroups?.length ? translate("Select which channels this facility publishes inventory too.") : translate("There are no inventory channels setup yet") }}
            </ion-card-content>
            <ion-item v-for="group in associatedInventoryGroups" :key="group.facilityGroupId">
              <ion-toggle :checked="group.isChecked" @click.prevent="updateSellInventoryOnlineSetting($event, group)">{{ group?.facilityGroupName }}</ion-toggle>
            </ion-item>
            <ion-button v-if="!associatedInventoryGroups.length" expand="block" fill="outline" @click="openCreateInventoryGroupModal()">
              {{ translate("Add") }}
              <ion-icon slot="end" :icon="addCircleOutline" />
            </ion-button>
          </ion-card>

          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ translate("Online Order Fulfillment") }}
              </ion-card-title>
            </ion-card-header>
            <ion-card-content>
              {{ translate("Configure the order fulfillment capacity of your facility.") }}
              <br/><br/>
              {{ translate("Setting fulfillment capacity to 0 disables new order from being allocated to this facility. Leave this empty if this facility's fulfillment capacity is unrestricted.") }}
            </ion-card-content>
            <ion-item lines="none" v-if="current.orderLimitType === 'custom'">
              <ion-text>{{ current.orderCount }}</ion-text>
              <ion-progress-bar class="ion-margin" :value="current.orderCount / (current.maximumOrderLimit || 1)" />
              <ion-chip outline @click="changeOrderLimitPopover($event)">{{ current.maximumOrderLimit }}</ion-chip>
            </ion-item>
            <ion-item lines="none" v-else-if="current.orderLimitType === 'unlimited'">
              <ion-label>{{ translate("orders allocated today", { orderCount: current.orderCount }) }}</ion-label>
              <ion-chip outline @click="changeOrderLimitPopover($event)">{{ translate("Unlimited") }}</ion-chip>
            </ion-item>
            <ion-item lines="none" v-else>
              <ion-label>{{ translate("orders in fulfillment queue", { orderCount: current.orderCount }) }}</ion-label>
              <ion-chip outline @click="changeOrderLimitPopover($event)" color="danger" fill="outline">{{ current.maximumOrderLimit }}</ion-chip>
            </ion-item>
            <ion-item lines="none" detail button @click="openFacilityOrderCountModal">
              <ion-label>{{ translate("View order count history") }}</ion-label>
            </ion-item>
          </ion-card>

          <!-- TODO: implement facility login flows (create/manage facility user logins) once backend has support.
               Original creates a new user login via raw OFBiz service calls with no REST equivalent wired up in this app yet.
          <ion-card>
            <ion-card-header>
              <ion-card-title>
                {{ facilityTypesById[current.facilityTypeId]?.description ? translate(`${facilityTypesById[current.facilityTypeId]?.description} logins`) : translate('logins', { facilitytype: `${current.facilityTypeId}` }) }}
              </ion-card-title>
            </ion-card-header>
            <ion-item v-for="facilityLogin in facilityLogins" :key="facilityLogin.partyId">
              <ion-avatar slot="start">
                <Image :src="getImageUrl(facilityLogin.objectInfo)"/>
              </ion-avatar>
              <ion-label>
                {{ facilityLogin.fullName }}
                <p>{{ facilityLogin.partyId }}</p>
              </ion-label>
              <ion-button slot="end" fill="clear" size="default" color="medium" @click="openFacilityLoginActionPopover($event, facilityLogin)">
                <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
              </ion-button>
            </ion-item>
          </ion-card>
          -->
        </section>

        <ion-segment scrollable v-model="segment">
          <ion-segment-button value="external-mappings" layout="icon-start">
            <ion-icon :icon="globeOutline" />
            <ion-label>{{ translate("External mappings") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="staff" layout="icon-start">
            <ion-icon :icon="personOutline" />
            <ion-label>{{ translate("Staff") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="locations" layout="icon-start">
            <ion-icon :icon="locationOutline" />
            <ion-label>{{ translate("Locations") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="groups" layout="icon-start">
            <ion-icon :icon="albumsOutline" />
            <ion-label>{{ translate("Groups") }}</ion-label>
          </ion-segment-button>
        </ion-segment>

        <template v-if="segment === 'external-mappings'">
          <ion-button fill="outline" @click="openFacilityMappingPopover($event)">
            <ion-icon :icon="addCircleOutline" slot="start" />
            {{ translate("Map facility to an external system") }}
          </ion-button>
          <div class="external-mappings">
            <ion-card v-for="(shopifyFacilityMapping, index) in current.shopifyFacilityMappings" :key="'shopify-' + index">
              <ion-card-header>
                <ion-card-title>
                  {{ translate("Shopify facility") }}
                </ion-card-title>
              </ion-card-header>
              <ion-item lines="full">
                <ion-label>
                  {{ shopifyFacilityMapping.name }}
                  <p>{{ shopifyFacilityMapping.shopId }}</p>
                </ion-label>
              </ion-item>
              <ion-item lines="full">
                <ion-label>{{ shopifyFacilityMapping.shopifyLocationId }}</ion-label>
              </ion-item>
              <ion-button fill="clear" @click="editShopifyFacilityMapping(shopifyFacilityMapping)">{{ translate("Edit") }}</ion-button>
              <ion-button fill="clear" color="danger" @click="removeShopifyFacilityMapping(shopifyFacilityMapping)">{{ translate("Remove") }}</ion-button>
            </ion-card>
            <ion-card v-for="(mapping, index) in current.identifications" :key="'mapping-' + index">
              <ion-card-header>
                <ion-card-title>
                  {{ externalMappingTypes[mapping.facilityIdenTypeId] || mapping.facilityIdenTypeId }}
                </ion-card-title>
                <ion-button fill="clear" @click="copyToClipboard(mapping.idValue)">
                  <ion-icon slot="icon-only" :icon="copyOutline" />
                </ion-button>
              </ion-card-header>
              <ion-item lines="full">
                <ion-label>{{ translate('Identification') }}</ion-label>
                <ion-label slot="end">{{ mapping.idValue }}</ion-label>
              </ion-item>
              <ion-button fill="clear" @click="editFacilityMapping(mapping)">{{ translate("Edit") }}</ion-button>
              <ion-button fill="clear" color="danger" @click="removeFacilityMapping(mapping)">{{ translate("Remove") }}</ion-button>
            </ion-card>
            <ion-card v-if="current.externalId">
              <ion-card-header>
                <ion-card-title>
                  {{ translate('Facility External ID') }}
                </ion-card-title>
                <ion-button fill="clear" @click="copyToClipboard(current.externalId)">
                  <ion-icon slot="icon-only" :icon="copyOutline" />
                </ion-button>
              </ion-card-header>
              <ion-item lines="full">
                <ion-label>{{ translate('Identification') }}</ion-label>
                <ion-label slot="end">{{ current.externalId }}</ion-label>
              </ion-item>
              <ion-button fill="clear" @click="editFacilityExternalId()">{{ translate("Edit") }}</ion-button>
              <ion-button fill="clear" color="danger" @click="removeFacilityExternalID()">{{ translate("Remove") }}</ion-button>
            </ion-card>
          </div>
        </template>

        <template v-else-if="segment === 'staff'">
          <ion-button fill="outline" @click="addStaffMemberModal()">
            <ion-icon :icon="addCircleOutline" slot="start" />
            {{ translate("Staff member") }}
          </ion-button>

          <div v-for="(party, index) in staffParties" class="list-item staff" :key="index">
            <ion-item lines="none">
              <ion-icon :icon="personOutline" slot="start" />
              <ion-label>
                {{ party.fullName }}
                <p>{{ party.partyId }}</p>
              </ion-label>
            </ion-item>

            <ion-label class="tablet">
              <ion-chip outline>{{ partyRoles[party.roleTypeId] ? partyRoles[party.roleTypeId] : party.roleTypeId }}</ion-chip>
              <p>{{ translate("role") }}</p>
            </ion-label>

            <ion-label class="tablet">
              <ion-chip outline>{{ getDate(party.fromDate) }}</ion-chip>
              <p>{{ translate("added") }}</p>
            </ion-label>

            <ion-button @click="removePartyFromFacility(party)" fill="clear" color="medium">
              <ion-icon slot="icon-only" :icon="closeCircleOutline" />
            </ion-button>
          </div>
        </template>

        <template v-else-if="segment == 'locations'">
          <ion-button fill="outline" @click="addLocationModal()">
            <ion-icon :icon="addCircleOutline" slot="start" />
            {{ translate("Internal locations") }}
          </ion-button>

          <div class="list-item" v-for="location in current.locations" :key="location.locationSeqId">
            <ion-item lines="none">
              <ion-icon :icon="locationOutline" slot="start" />
              <ion-label>
                {{ location.locationSeqId }}
                <p>{{ locationTypes[location.locationTypeEnumId] }}</p>
              </ion-label>
            </ion-item>

            <ion-label class="tablet">
              {{ location.areaId }}
              <p>{{ translate("area") }}</p>
            </ion-label>

            <ion-label>
              {{ location.aisleId }}
              <p>{{ translate("aisle") }}</p>
            </ion-label>

            <ion-label>
              {{ location.sectionId }}
              <p>{{ translate("section") }}</p>
            </ion-label>

            <ion-label class="tablet">
              {{ location.levelId }}
              <p>{{ translate("level") }}</p>
            </ion-label>

            <ion-label>
              {{ location.positionId ? location.positionId : '-' }}
              <p>{{ translate("sequence") }}</p>
            </ion-label>

            <ion-button fill="clear" color="medium" @click="openLocationDetailsPopover($event, location)">
              <ion-icon slot="icon-only" :icon="ellipsisVerticalOutline" />
            </ion-button>
          </div>
        </template>

        <template v-else-if="segment == 'groups'">
          <ion-button fill="outline" @click="addFacilityGroupModal()">
            <ion-icon :icon="addCircleOutline" slot="start" />
            {{ translate("Link to groups") }}
          </ion-button>

          <div class="external-mappings">
            <ion-card v-for="(group, index) in current.groupInformation" :key="index">
              <p v-if="getFacilityGroupTypeDesc(group.facilityGroupTypeId)" class="ion-margin-start overline">{{ getFacilityGroupTypeDesc(group.facilityGroupTypeId) }}</p>
              <ion-card-header>
                <div>
                  <ion-card-title>{{ group.facilityGroupName }}</ion-card-title>
                  <ion-card-subtitle>{{ group.facilityGroupId }}</ion-card-subtitle>
                </div>
                <ion-button fill="clear" @click="removeFacilityFromGroup(group.facilityGroupId)">
                  <ion-icon slot="icon-only" :icon="unlinkOutline" />
                </ion-button>
              </ion-card-header>
              <ion-item v-if="group.description" lines="none">
                <ion-label class="ion-text-wrap">{{ group.description }}</ion-label>
              </ion-item>
            </ion-card>
          </div>
        </template>
      </main>
      <main v-else class="ion-text-center ion-padding-top">
        {{ translate("Failed to fetch facility information") }}
      </main>

      <ion-modal class="add-facility-group-modal" :is-open="showAddFacilityGroup" @didDismiss="closeAddFacilityGroup">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeAddFacilityGroup()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Add Group") }}</ion-title>
          </ion-toolbar>
          <ion-toolbar>
            <ion-searchbar v-model="facilityGroupQueryString" @keyup.enter="facilityGroupQueryString = $event.target.value; findGroups()" @ionClear="facilityGroupQueryString = ''; findGroups()"/>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <div class="empty-state" v-if="!Object.keys(filteredFacilityGroupsByType).length">
            <p>{{ translate("No facility groups found") }}</p>
          </div>
          <form v-else @keyup.enter="updateGroups">
            <ion-list>
              <ion-item-group v-for="(groups, typeId) in filteredFacilityGroupsByType" :key="typeId">
                <ion-item-divider color="light">{{ getFacilityGroupTypeDesc(String(typeId)) }}</ion-item-divider>
                <ion-item v-for="group in groups" :key="group.facilityGroupId">
                  <ion-checkbox :checked="isFacilityGroupLinked(group.facilityGroupId)" @ion-change="updateGroupsForFacility(group.facilityGroupId)">{{ group.facilityGroupName }}</ion-checkbox>
                </ion-item>
              </ion-item-group>
            </ion-list>
          </form>
          <ion-fab vertical="bottom" horizontal="end" slot="fixed">
            <ion-fab-button @click="updateGroups">
              <ion-icon :icon="saveOutline" />
            </ion-fab-button>
          </ion-fab>
        </ion-content>
      </ion-modal>

      <ion-modal class="facility-address-modal" :is-open="showAddressModal" @didDismiss="closeAddressModal" @didPresent="focusAddressInput">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeAddressModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Address and contact details") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <form @keyup.enter="saveContact()">
            <ion-item-divider color="light">
              <ion-label>{{ translate("Address") }}</ion-label>
            </ion-item-divider>
            <ion-item>
              <ion-input id="inputElement" :label="translate('Shipping name')" label-placement="floating" v-model="address.toName" />
            </ion-item>
            <ion-item>
              <ion-input label-placement="floating" v-model="address.address1">
                <div slot="label">{{ translate("Address line 1") }} <ion-text color="danger">*</ion-text></div>
              </ion-input>
            </ion-item>
            <ion-item>
              <ion-input :label="translate('Address line 2')" label-placement="floating" v-model="address.address2" />
            </ion-item>
            <ion-item>
              <ion-input :label="translate('Directions')" label-placement="floating" v-model="address.directions" />
            </ion-item>
            <ion-item>
              <ion-input label-placement="floating" v-model="address.city">
                <div slot="label">{{ translate("City") }} <ion-text color="danger">*</ion-text></div>
              </ion-input>
            </ion-item>
            <ion-item @keyup.enter.stop>
              <ion-select label-placement="floating" :label="translate('Country')" interface="popover" :placeholder="translate('Select')" @ionChange="updateState($event)" v-model="address.countryGeoId">
                <ion-select-option v-for="country in countries" :key="country.geoId" :value="country.geoId">{{ country.geoName }}</ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item @keyup.enter.stop>
              <ion-select label-placement="floating" :label="translate('State')" interface="popover" :disabled="!address.countryGeoId" :placeholder="translate('Select')" v-model="address.stateProvinceGeoId">
                <ion-select-option v-for="state in states[address.countryGeoId]" :key="state.geoId" :value="state.geoId">
                  {{ state.wellKnownText && state.wellKnownText !== state.geoName ? `${state.geoName} (${state.wellKnownText})` : state.geoName }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-input label-placement="floating" v-model="address.postalCode" @keydown="validateZipCode($event)">
                <div slot="label">{{ translate("Zipcode") }} <ion-text color="danger">*</ion-text></div>
              </ion-input>
            </ion-item>
            <ion-item-divider color="light">
              <ion-label>{{ translate("Contact details") }}</ion-label>
            </ion-item-divider>
            <ion-item>
              <ion-input :label="translate('Contact number')" :label-placement="telecomNumberValue?.countryCode ? 'stacked' : 'floating'" v-model="telecomNumberValue.contactNumber">
                <ion-text slot="start" v-if="telecomNumberValue?.countryCode && telecomNumberValue?.contactNumber">{{ telecomNumberValue?.countryCode }}</ion-text>
              </ion-input>
            </ion-item>
            <ion-item>
              <ion-input label-placement="floating" :label="translate('Email address')" v-model="emailAddress.infoString" />
            </ion-item>
          </form>
        </ion-content>

        <ion-fab vertical="bottom" horizontal="end" slot="fixed">
          <ion-fab-button @click="saveContact()" :disabled="!isAddressUpdated() && !isTelecomNumberUpdated() && !isEmailAddressUpdated()">
            <ion-icon :icon="saveOutline" />
          </ion-fab-button>
        </ion-fab>
      </ion-modal>

      <ion-modal class="facility-geo-point-modal" :is-open="showGeoPointModal" @didDismiss="closeGeoPointModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeGeoPointModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Latitude & Longitude") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <form @keyup.enter="saveGeoPoint">
            <ion-item class="ion-margin-bottom">
              <ion-input aria-label="zipcode" :placeholder="translate('Zipcode')" v-model="geoPoint.postalCode" @keydown="validateZipCode($event)" @ionInput="postalCodeUpdate"/>
              <ion-button slot="end" fill="outline" :disabled="!isPostalCodeChanged" @click="generateLatLong">
                {{ translate("Generate") }}
                <ion-icon v-if="!isGeneratingLatLong" slot="end" :icon="colorWandOutline" />
                <ion-spinner v-else data-spinner-size="small"/>
              </ion-button>
            </ion-item>
            <ion-item>
              <ion-input label-placement="floating" type="number" v-model="geoPoint.latitude">
                <div slot="label">{{ translate("Latitude")}}<ion-text color="danger">*</ion-text></div>
              </ion-input>
            </ion-item>
            <ion-item>
              <ion-input label-placement="floating" type="number" v-model="geoPoint.longitude">
                <div slot="label">{{ translate("Longitude")}}<ion-text color="danger">*</ion-text></div>
              </ion-input>
            </ion-item>
          </form>
        </ion-content>

        <ion-fab vertical="bottom" horizontal="end" slot="fixed">
          <ion-fab-button @click="saveGeoPoint">
            <ion-icon :icon="saveOutline" />
          </ion-fab-button>
        </ion-fab>
      </ion-modal>

      <ion-modal class="view-facility-order-count-modal" :is-open="showFacilityOrderCountModal" @didDismiss="closeFacilityOrderCountModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeFacilityOrderCountModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Consumed Order Limit") }}</ion-title>
          </ion-toolbar>
        </ion-header>

        <ion-content>
          <ion-grid v-if="facilityOrderCounts.length && !isOrderCountLoading">
            <ion-row class="ion-justify-content-center">
              <ion-col>{{ translate('Entry Date') }}</ion-col>
              <ion-col>{{ translate('Consumed Order Limit') }}</ion-col>
            </ion-row>
            <ion-row class="ion-justify-content-center" v-for="facilityOrderCount in facilityOrderCounts" :key="facilityOrderCount.facilityId">
              <ion-col>{{ facilityOrderCount.entryDate }}</ion-col>
              <ion-col>{{ facilityOrderCount.lastOrderCount }}</ion-col>
            </ion-row>
          </ion-grid>
          <div v-else-if="!isOrderCountLoading" class="ion-text-center ion-padding-top">
            {{ translate('No records found') }}
          </div>
        </ion-content>
      </ion-modal>

      <ion-modal class="add-staff-member-modal" :is-open="showStaffModal" @didDismiss="closeStaffModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeStaffModal()">
                <ion-icon slot="icon-only" :icon="closeOutline" />
              </ion-button>
            </ion-buttons>
            <ion-title>{{ translate("Staff") }}</ion-title>
          </ion-toolbar>
          <ion-toolbar>
            <ion-searchbar v-model="staffQueryString" @keyup.enter="staffQueryString = $event.target.value; findParties()"/>
          </ion-toolbar>
        </ion-header>

        <ion-content class="ion-padding">
          <div class="ion-padding" v-if="!parties.length">
            {{ translate("No party found") }}
          </div>
          <ion-list v-else>
            <ion-list-header>{{ translate("Staff") }}</ion-list-header>
            <ion-item v-for="(party, index) in parties" :key="index">
              <ion-select interface="popover" :placeholder="translate('Select')" :value="getPartyRoleTypeId(party.partyId)" @ion-change="updateSelectedParties($event, party.partyId)" required>
                <ion-label slot="label">
                  {{ party.fullName }}
                  <p>{{ party.partyId }}</p>
                </ion-label>
                <ion-select-option v-for="(description, roleTypeId) in staffPartyRoles" :key='roleTypeId' :value="roleTypeId">{{ description }}</ion-select-option>
              </ion-select>
            </ion-item>
          </ion-list>
        </ion-content>

        <ion-fab vertical="bottom" horizontal="end" slot="fixed">
          <ion-fab-button :disabled="!isRoleUpdated()" @click="saveParties">
            <ion-icon :icon="saveOutline" />
          </ion-fab-button>
        </ion-fab>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  alertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonCheckbox,
  IonChip,
  IonCol,
  IonContent,
  IonFab,
  IonFabButton,
  IonGrid,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonItemGroup,
  IonInput,
  IonLabel,
  IonList,
  IonListHeader,
  IonModal,
  IonPage,
  IonProgressBar,
  IonRadio,
  IonRadioGroup,
  IonRow,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSkeletonText,
  IonSpinner,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
  modalController,
  onIonViewWillEnter,
  popoverController
} from '@ionic/vue'
import {
  addCircleOutline,
  albumsOutline,
  bookmarkOutline,
  bookmarksOutline,
  chevronForwardOutline,
  closeCircleOutline,
  closeOutline,
  colorWandOutline,
  copyOutline,
  ellipsisVerticalOutline,
  globeOutline,
  locationOutline,
  lockClosedOutline,
  openOutline,
  personOutline,
  saveOutline,
  unlinkOutline
} from 'ionicons/icons'
import { ref, computed, watch } from 'vue';
import { commonUtil, emitter, logger, translate } from "@common";
import { DateTime } from 'luxon';
import GeoPointPopover from '@/components/facility/GeoPointPopover.vue';
import SelectProductStoreModal from '@/components/product-store/SelectProductStoreModal.vue';
import ProductStorePopover from '@/components/product-store/ProductStorePopover.vue';
import FacilityTimeZoneSwitcher from '@/components/facility/FacilityTimeZoneSwitcher.vue';
import CustomScheduleModal from '@/components/common/CustomScheduleModal.vue';
import AddOperatingHoursModal from '@/components/facility/AddOperatingHoursModal.vue';
import OperatingHoursPopover from '@/components/facility/OperatingHoursPopover.vue';
import OrderLimitPopover from '@/components/facility/OrderLimitPopover.vue';
import FacilityLoginActionPopover from '@/components/facility/FacilityLoginActionPopover.vue';
import Image from '@/components/common/Image.vue';
import CreateFacilityGroupModal from '@/components/facility/CreateFacilityGroupModal.vue';
import AddLocationModal from '@/components/facility/AddLocationModal.vue';
import LocationDetailsPopover from '@/components/facility/LocationDetailsPopover.vue';
import FacilityMappingModal from '@/components/facility/FacilityMappingModal.vue';
import FacilityShopifyMappingModal from '@/components/facility/FacilityShopifyMappingModal.vue';
import FacilityExternalIdModal from '@/components/facility/FacilityExternalIdModal.vue';
import FacilityMappingPopover from '@/components/facility/FacilityMappingPopover.vue';

import { useFacilityMutations, useFacilityTypes, useFacilityGroups, useFacilityGroupTypes, useFacilityDetail, useFacilityIdentificationTypes, usePartyQueries, useFacilityOrderCounts } from '@/composables/useFacilities';
import { useRoleTypes, useTypedEnums, useGeos, useEnums, useGeocode } from '@/composables/useSeed';

const props = defineProps<{ facilityId: string }>();

// Reads: one façade over cache + live + volatile. Writes: one function per endpoint.
const {
  current, hydrated, loadingAssociations, loadingVolatile,
  calendarOptions, load, reloadAssociations, refreshVolatile,
} = useFacilityDetail(props.facilityId);
const mutations = useFacilityMutations(props.facilityId);

// Lookups, all from the login-time cache — no fetch on entry.
const { facilityTypes } = useFacilityTypes();
const { facilityGroupTypes } = useFacilityGroupTypes();
const { facilityGroups: allFacilityGroups } = useFacilityGroups();
const { descriptionById: partyRoles } = useRoleTypes();
const { descriptionById: locationTypes } = useTypedEnums('FACLOC_TYPE');
const { countries, statesOf } = useGeos();
// Identification-type labels for the mapping cards (FACILITY_IDENTITY enums).
const { byId: externalMappingTypes } = useFacilityIdentificationTypes();

const isLoading = computed(() => !hydrated.value);
const selectedCountryGeoId = ref('');
const segment = ref('external-mappings');
const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

const postalAddress = computed(() => current.value.postalAddress || {});
const contactDetails = computed(() => current.value.contactDetails || {});
const facilityCalendar = computed(() => current.value.calendar || {});
const facilityProductStores = computed(() => current.value.productStores || []);
const facilityParties = computed(() => current.value.parties || []);
const facilityLogins = computed(() => facilityParties.value.filter((party: any) => party.roleTypeId === 'FAC_LOGIN'));
const staffParties = computed(() => facilityParties.value.filter((party: any) => party.roleTypeId !== 'FAC_LOGIN'));
const calendars = calendarOptions;
// Inventory channels are facility groups of the channel type — a filter, not a fetch.
const inventoryGroups = computed(() => allFacilityGroups.value.filter((g: any) => g.facilityGroupTypeId === 'CHANNEL_FAC_GROUP'));
const facilityTypesById = computed(() => facilityTypes.value.reduce((acc: any, type: any) => {
  acc[type.facilityTypeId] = type;
  return acc;
}, {}));
const parentFacilityTypeId = ref('');
const facilityTypeId = ref('');
const facilityTypeIdOptions = ref({} as any);
const initialParentFacilityTypeId = ref('');

const associatedInventoryGroups = computed(() => inventoryGroups.value.map((group: any) => ({
  ...group,
  isChecked: current.value.groupInformation?.some((facilityGroup: any) => facilityGroup?.facilityGroupId === group.facilityGroupId)
})));

const isRegenerationRequired = ref(false);
const selectedCalendarId = ref('');
const defaultDaysToShip = ref<number | undefined>();
const baseUrl = computed(() => commonUtil.getOmsURL());

function getImageUrl(imageUrl: string) {
  return (baseUrl.value.startsWith('http') ? baseUrl.value.replace(/api\/?/, "") : `https://${baseUrl.value}.hotwax.io/`) + imageUrl;
}

/**
 * Seed the editable fields from the CACHED facility row.
 *
 * Driven by a watcher rather than read once on view-enter: the row arrives from IndexedDB
 * asynchronously, so a cold cache (the first visit after login) left the facility-type selector and
 * days-to-ship blank with nothing to refill them. `seeded` keeps a later cache write — e.g. the
 * refresh after a save — from discarding what the user has since typed.
 */
let seededFromCache = false;
function seedFromCachedFacility() {
  if (seededFromCache || !current.value?.facilityTypeId) return;
  parentFacilityTypeId.value = getParentFacilityTypeId(current.value.facilityTypeId);
  initialParentFacilityTypeId.value = parentFacilityTypeId.value;
  facilityTypeId.value = current.value.facilityTypeId;
  getFacilityTypesByParentTypeId();
  defaultDaysToShip.value = current.value.defaultDaysToShip;
  seededFromCache = true;
}
watch(current, seedFromCachedFacility, { immediate: true, deep: true });

onIonViewWillEnter(async () => {
  seededFromCache = false;
  seedFromCachedFacility();
  // Cached parts are already on screen; this only fetches the live + volatile pieces.
  await load();
  selectedCountryGeoId.value = postalAddress.value.countryGeoId ?? '';
  if (postalAddress.value.latitude) await fetchPostalCodeByGeoPoints();
});

/** Walk the cached facility-type tree to the root parent (was a store getter). */
function getParentFacilityTypeId(typeId: string): string {
  let node = facilityTypesById.value[typeId];
  while (node?.parentTypeId) {
    const parent = facilityTypesById.value[node.parentTypeId];
    if (!parent) return node.parentTypeId;
    node = parent;
  }
  return node?.facilityTypeId ?? '';
}

/** Party+role lookup for the staff picker — a one-off live query, deliberately not cached. */
async function getPartyRoleAndPartyDetails(payload: Record<string, any>) {
  const { roleTypeId, ...params } = payload;
  const { fetchPartyRoleDetails } = usePartyQueries();
  return fetchPartyRoleDetails(roleTypeId, params);
}

function getFacilityTypesByParentTypeId() {
  facilityTypeIdOptions.value = parentFacilityTypeId.value ? Object.keys(facilityTypesById.value).reduce((acc: any, fId: string) => {
    if (facilityTypesById.value[fId].parentTypeId === parentFacilityTypeId.value) {
      acc[fId] = facilityTypesById.value[fId];
    }
    return acc;
  }, {}) : facilityTypesById.value;

  // Stops this flow from auto-selecting/persisting a subtype on initial load, only react to an actual
  // user-driven change of the parent type select.
  if (initialParentFacilityTypeId.value === parentFacilityTypeId.value) {
    return;
  }

  // RETAIL_STORE and WAREHOUSE are treated as default elements within the list, wherever they appear.
  facilityTypeId.value = facilityTypeIdOptions.value['RETAIL_STORE'] ? 'RETAIL_STORE' : facilityTypeIdOptions.value['WAREHOUSE'] ? 'WAREHOUSE' : Object.keys(facilityTypeIdOptions.value)[0];
  updateFacilityType();
}

async function renameFacility() {
  await alertController.create({
    header: translate('Rename Facility'),
    inputs: [
      {
        name: 'facilityName',
        type: 'text',
        value: current.value.facilityName,
        placeholder: translate('Enter new facility name')
      }
    ],
    buttons: [
      {
        text: translate('Cancel'),
        role: 'cancel'
      },
      {
        text: translate('Save'),
        handler: async (data) => {
          if (data.facilityName && data.facilityName !== current.value.facilityName) {
            try {
              await mutations.updateFacility({
                facilityId: props.facilityId,
                facilityName: data.facilityName
              });

              commonUtil.showToast(translate("Facility name updated"));
            } catch (error) {
              commonUtil.showToast(translate('Failed to update facility name.'));
              logger.error('Failed to update facility name.', error);
            }
          }
        }
      }
    ]
  }).then(alert => alert.present());
}

async function updateFacilityType() {
  try {
    const resp = await mutations.updateFacility({
      facilityId: props.facilityId,
      facilityTypeId: facilityTypeId.value
    });

    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Facility type updated"));
    } else {
      throw resp.data;
    }
  } catch (error) {
    parentFacilityTypeId.value = getParentFacilityTypeId(current.value.facilityTypeId);
    facilityTypeId.value = current.value.facilityTypeId;
    commonUtil.showToast(translate('Failed to update facility type.'));
    logger.error('Failed to update facility type.', error);
  }
}

async function closeFacility(event: any) {
  event.stopImmediatePropagation();
  emitter.emit("presentLoader");
  const isChecked = !event.target.checked;

  let closedDate = isChecked ? DateTime.now().toMillis() : ""

  try {
    await mutations.updateFacility({
      "facilityId": current.value.facilityId,
      "closedDate": closedDate
    })
    commonUtil.showToast(translate('Facility has been marked as ', { status: isChecked ? 'closed' : 'open' }))
  } catch(err) {
    commonUtil.showToast(translate('Failed to update facility.'))
    logger.error('Failed to update facility.', err)
  }
  emitter.emit("dismissLoader");
}

async function editMapUrl() {
  const alert = await alertController.create({
    header: translate("Map Link"),
    inputs: [{
      name: 'mapUrl',
      type: 'url',
      placeholder: translate("Enter new Map Url"),
      value: contactDetails.value?.googleMapUrl?.infoString || ""
    }],
    buttons: [
      { text: translate('Cancel'), role: 'cancel' },
      {
        text: translate('Save'),
        handler: async (data) => {
          let isValidUrl = true;
          try { new URL(data.mapUrl); } catch (_) { isValidUrl = false; }

          if (!isValidUrl) {
            commonUtil.showToast(translate("Please enter a valid URL"));
            return false;
          }

          try {
            const payload = { facilityId: props.facilityId, infoString: data.mapUrl.trim() };
            let resp;
            if (contactDetails.value?.googleMapUrl?.contactMechId) {
              if (data.mapUrl && data.mapUrl !== contactDetails.value.googleMapUrl.infoString) {
                resp = await mutations.updateMapUrl({
                  contactMechPurposeTypeId: "PRIMARY_LOCATION",
                  ...payload,
                  contactMechId: contactDetails.value.googleMapUrl.contactMechId,
                  contactMechTypeId: "MAP_URL"
                });
              } else {
                return;
              }
            } else {
              resp = await mutations.createMapUrl({
                ...payload,
                contactMechTypeId: "MAP_URL",
                contactMechPurposeTypeId: "GOOGLE_MAP_URL"
              });
            }

            if (!commonUtil.hasError(resp)) {
              commonUtil.showToast(translate("Map URL updated successfully"));
              await reloadAssociations();
            } else {
              throw resp.data;
            }
          } catch (err) {
            logger.error("Failed to update Map URL", err);
            commonUtil.showToast(translate("Failed to update Map URL"));
          }
        }
      }
    ]
  });
  await alert.present();
}

async function deleteMapUrl() {
  try {
    const resp = await mutations.deleteMapUrl({
      facilityId: props.facilityId,
      contactMechId: contactDetails.value?.googleMapUrl?.contactMechId
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Map URL removed successfully.'));
      await reloadAssociations();
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to remove map url.', err);
    commonUtil.showToast(translate('Failed to remove map url.'));
  }
}

async function selectProductStores() {
  const modal = await modalController.create({
    component: SelectProductStoreModal,
    componentProps: { selectedProductStores: facilityProductStores.value }
  });

  modal.onDidDismiss().then(async (result: any) => {
    if (result.data?.value) {
      emitter.emit('presentLoader');

      const { productStoresToCreate, productStoresToRemove } = result.data.value;

      const removePromises = productStoresToRemove.map((payload: any) =>
        mutations.updateProductStore({
          facilityId: props.facilityId,
          productStoreId: payload.productStoreId,
          fromDate: facilityProductStores.value.find((productStore: any) => productStore.productStoreId === payload.productStoreId)?.fromDate,
          thruDate: DateTime.now().toMillis()
        })
      );

      const createPromises = productStoresToCreate.map((payload: any) =>
        mutations.addProductStore({
          productStoreId: payload.productStoreId,
          facilityId: props.facilityId,
          fromDate: DateTime.now().toMillis()
        })
      );

      const responses = await Promise.allSettled([...removePromises, ...createPromises]);
      if (responses.some((response: any) => response.status === 'rejected')) {
        commonUtil.showToast(translate('Failed to update some product stores'));
      } else {
        commonUtil.showToast(translate('Product stores updated successfully.'));
      }

      emitter.emit('dismissLoader');
    }
  });

  modal.present();
}

async function productStorePopover(ev: Event, store: any) {
  const popover = await popoverController.create({
    component: ProductStorePopover,
    componentProps: { currentProductStore: store, facilityId: props.facilityId },
    event: ev,
    showBackdrop: false
  });
  return popover.present();
}

async function openGeoPointModal() {
  geoPoint.value = JSON.parse(JSON.stringify(facilityPostalAddress.value));
  isGeneratingLatLong.value = false;
  isPostalCodeChanged.value = false;
  showGeoPointModal.value = true;
}

async function openAddressModal() {
  address.value = JSON.parse(JSON.stringify(facilityPostalAddress.value));
  telecomNumberValue.value = telecomAndEmailAddress.value?.telecomNumber ? JSON.parse(JSON.stringify(telecomAndEmailAddress.value.telecomNumber)) : {};
  emailAddress.value = telecomAndEmailAddress.value?.emailAddress ? JSON.parse(JSON.stringify(telecomAndEmailAddress.value.emailAddress)) : {};

  if (address.value.countryGeoId) {
    selectedCountryGeoId.value = address.value.countryGeoId;
    const country = countries.value.find((country: any) => country.geoId === address.value.countryGeoId);
    if (country) {
      telecomNumberValue.value.countryCode = commonUtil.getTelecomCountryCode(country.geoCodeAlpha2) || commonUtil.getTelecomCountryCode(country.geoCode);
    }
  }
  if (!address.value.toName) {
    address.value.toName = current.value.facilityName;
  }

  showAddressModal.value = true;
}

async function fetchPostalCodeByGeoPoints() {
  const payload = {
    json: {
      "query": "*:*",
      "filter": "{!geofilt sfield=location}",
      "params": {
        "pt": `${postalAddress.value.latitude}, ${postalAddress.value.longitude}`,
        "d": "10"
      },
      sort: 'geodist(location, ' + postalAddress.value.latitude + ',' + postalAddress.value.longitude + ') asc',
      "limit": 1
    }
  };

  try {
    const { geocode } = useGeocode();
    const resp = await geocode(payload);
    const pCode = postalAddress.value.postalCode;
    const fetchedPostcode = resp.response.docs[0].postcode;
    isRegenerationRequired.value = !(pCode.startsWith('0') ? pCode.substring(1) === fetchedPostcode || pCode === fetchedPostcode : pCode === fetchedPostcode);
  } catch (err) {
    logger.error(err);
  }
}

async function openLatLongPopover(event: Event) {
  const popover = await popoverController.create({
    component: GeoPointPopover,
    componentProps: { facilityId: props.facilityId, isRegenerationRequired: isRegenerationRequired.value, postalAddress: postalAddress.value },
    event,
    showBackdrop: false
  });

  popover.onDidDismiss().then((result) => {
    if (result?.data?.generatedLatLong) {
      isRegenerationRequired.value = false;
    }
    // Lat/long lives on the postal address, which is live per visit.
    reloadAssociations();
  });

  return popover.present();
}

async function openTimeZoneModal() {
  const modal = await modalController.create({
    component: FacilityTimeZoneSwitcher,
    componentProps: { facilityId: props.facilityId },
  });
  return modal.present();
}

async function associateCalendarToFacility() {
  emitter.emit('presentLoader');
  try {
    const resp = await mutations.saveCalendar({
      facilityId: props.facilityId,
      calendarId: selectedCalendarId.value,
      fromDate: DateTime.now().toMillis(),
      facilityCalendarTypeId: 'OPERATING_HOURS'
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Successfully associated calendar to the facility."));
      await reloadAssociations();
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to associate calendar to the facility."));
    logger.error(err);
  }
  emitter.emit('dismissLoader');
}

async function addCustomSchedule() {
  const modal = await modalController.create({
    component: CustomScheduleModal,
    componentProps: { facilityId: props.facilityId }
  });
  return modal.present();
}

async function addOperatingHours() {
  const modal = await modalController.create({
    component: AddOperatingHoursModal,
    componentProps: { facilityId: props.facilityId }
  });
  return modal.present();
}

async function openOperatingHoursPopover(event: Event) {
  const popover = await popoverController.create({
    component: OperatingHoursPopover,
    componentProps: { facilityId: props.facilityId },
    event,
    showBackdrop: false
  });
  return popover.present();
}

async function openFacilityLoginActionPopover(ev: Event, facilityLogin: any) {
  const popover = await popoverController.create({
    component: FacilityLoginActionPopover,
    componentProps: { currentFacility: current.value, currentFacilityUser: facilityLogin, facilityTypeDesc: facilityTypesById.value[current.value.facilityTypeId]?.description },
    event: ev,
    showBackdrop: false
  });
  return popover.present();
}

async function changeOrderLimitPopover(ev: Event) {
  const popover = await popoverController.create({
    component: OrderLimitPopover,
    event: ev,
    showBackdrop: false,
    componentProps: { fulfillmentOrderLimit: current.value.maximumOrderLimit }
  });
  popover.present();

  const result = await popover.onDidDismiss();
  if (result.data !== undefined && result.data !== current.value.maximumOrderLimit) {
    emitter.emit('presentLoader');
    try {
      const resp = await mutations.updateFacility({
        facilityId: current.value.facilityId,
        maximumOrderLimit: result.data === "" ? null : result.data
      });
      if (!commonUtil.hasError(resp)) {
        const newLimit = result.data === "" ? null : result.data;
        const orderLimitType = newLimit === 0 ? 'no-capacity' : (newLimit ? 'custom' : 'unlimited');
        commonUtil.showToast(translate('Fulfillment capacity updated successfully for ', { facilityName: current.value.facilityName }));
      } else {
        throw resp.data;
      }
    } catch (err) {
      commonUtil.showToast(translate('Failed to update fulfillment capacity for ', { facilityName: current.value.facilityName }));
      logger.error('Failed to update facility', err);
    }
    emitter.emit('dismissLoader');
  }
}

async function openCreateInventoryGroupModal() {
  const modal = await modalController.create({
    component: CreateFacilityGroupModal,
    componentProps: { selectedFacilityGroupTypeId: 'CHANNEL_FAC_GROUP' }
  });

  await modal.present();
  await modal.onDidDismiss();

  const invGroups = JSON.parse(JSON.stringify(inventoryGroups.value));
  invGroups.forEach((group: any) => {
    group['isChecked'] = current.value.groupInformation?.some((facilityGroup: any) => facilityGroup?.facilityGroupId === group.facilityGroupId);
  });
}

async function updateSellInventoryOnlineSetting(event: any, facilityGroup: any) {
  event.stopImmediatePropagation();
  const isChecked = !event.target.checked;
  emitter.emit("presentLoader");
  try {
    let resp;
    if (isChecked) {
      resp = await mutations.addToGroup({
        facilityId: current.value.facilityId,
        facilityGroupId: facilityGroup.facilityGroupId
      });
    } else {
      const groupInfo = current.value.groupInformation.find((group: any) => group.facilityGroupId === facilityGroup.facilityGroupId);
      resp = await mutations.updateGroupAssociation({
        facilityId: current.value.facilityId,
        facilityGroupId: facilityGroup.facilityGroupId,
        fromDate: groupInfo.fromDate,
        thruDate: DateTime.now().toMillis()
      });
    }
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(isChecked
        ? translate("is now selling on", { facilityName: current.value.facilityName, facilityGroupId: facilityGroup.facilityGroupName })
        : translate("no longer sells on", { facilityName: current.value.facilityName, facilityGroupId: facilityGroup.facilityGroupName })
      );
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to update sell inventory online setting"));
    logger.error("Failed to update sell inventory online setting", err);
  }
  emitter.emit("dismissLoader");
}

async function openFacilityOrderCountModal() {
  facilityOrderCounts.value = [];
  isOrderCountLoading.value = true;
  showFacilityOrderCountModal.value = true;
  try {
    const { fetchFacilityOrderCountsHistory } = useFacilityOrderCounts();
    const resp = await fetchFacilityOrderCountsHistory(props.facilityId, { orderByField: 'entryDate DESC', pageSize: 10 });
    if (!commonUtil.hasError(resp) && resp.data?.length > 0) {
      facilityOrderCounts.value = resp.data.map((item: any) => ({
        ...item,
        entryDate: DateTime.fromMillis(item.entryDate).toFormat('MMM dd yyyy')
      }));
    }
  } catch (error) {
    console.error("Failed to fetch facility order counts", error);
  } finally {
    isOrderCountLoading.value = false;
  }
}

async function updateFulfillmentSetting(event: any, facilityGroupId: string) {
  event.stopImmediatePropagation();
  emitter.emit('presentLoader');
  const isChecked = !event.target.checked;
  try {
    let resp;
    if (isChecked) {
      resp = await mutations.addToGroup({ facilityId: props.facilityId, facilityGroupId });
    } else {
      const groupInformation = current.value.groupInformation.find((group: any) => group.facilityGroupId === facilityGroupId);
      resp = await mutations.updateGroupAssociation({
        facilityId: props.facilityId,
        facilityGroupId,
        fromDate: groupInformation.fromDate,
        thruDate: DateTime.now().toMillis()
      });
    }
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Fulfillment setting updated successfully'));
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate('Failed to update fulfillment setting'));
    logger.error('Failed to update fulfillment setting', err);
  }
  emitter.emit('dismissLoader');
}

async function updateDefaultDaysToShip() {
  emitter.emit('presentLoader');
  try {
    const resp = await mutations.updateFacility({ facilityId: props.facilityId, defaultDaysToShip: defaultDaysToShip.value });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Updated default days to ship'));
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to update default days to ship', err);
    commonUtil.showToast(translate('Failed to update default days to ship'));
  }
  emitter.emit('dismissLoader');
}

async function openFacilityMappingPopover(ev: Event) {
  const popover = await popoverController.create({
    component: FacilityMappingPopover,
    componentProps: { facilityId: props.facilityId },
    event: ev,
    showBackdrop: false
  });
  return popover.present();
}

async function editShopifyFacilityMapping(shopifyFacilityMapping: any) {
  const modal = await modalController.create({
    component: FacilityShopifyMappingModal,
    componentProps: { shopifyFacilityMapping, type: 'update', facilityId: props.facilityId }
  });
  modal.present().then(() => {
    const el = document.querySelector("#inputElement") as any;
    if (el) el.setFocus();
  });
}

async function removeShopifyFacilityMapping(shopifyFacilityMapping: any) {
  try {
    const resp = await mutations.deleteShopifyLocation({
      facilityId: current.value.facilityId,
      shopId: shopifyFacilityMapping.shopId,
      shopifyLocationId: shopifyFacilityMapping.shopifyLocationId
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Removed shopify mapping successfully'));
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to remove shopify mapping', err);
    commonUtil.showToast(translate('Failed to remove shopify mapping'));
  }
}

async function editFacilityMapping(mapping: any) {
  const modal = await modalController.create({
    component: FacilityMappingModal,
    componentProps: { mappingId: mapping.facilityIdenTypeId, mapping, type: 'update', facilityId: props.facilityId }
  });
  modal.present().then(() => {
    const el = document.querySelector("#inputElement") as any;
    if (el) el.setFocus();
  });
}

async function removeFacilityMapping(mapping: any) {
  emitter.emit('presentLoader');
  try {
    const resp = await mutations.saveIdentification({
      facilityId: current.value.facilityId,
      facilityIdenTypeId: mapping.facilityIdenTypeId,
      fromDate: mapping.fromDate,
      thruDate: DateTime.now().toMillis()
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Removed facility mapping successfully'));
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to remove facility mapping', err);
    commonUtil.showToast(translate('Failed to remove facility mapping'));
  }
  emitter.emit('dismissLoader');
}

async function editFacilityExternalId() {
  const modal = await modalController.create({
    component: FacilityExternalIdModal,
    componentProps: { facilityId: props.facilityId },
  });
  modal.present().then(() => {
    const el = document.querySelector("#inputElement") as any;
    if (el) el.setFocus();
  });
}

async function removeFacilityExternalID() {
  emitter.emit('presentLoader');
  try {
    const resp = await mutations.updateFacility({ facilityId: current.value.facilityId, externalId: '' });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Removed facility external ID'));
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to remove facility external ID', err);
    commonUtil.showToast(translate('Failed to remove facility external ID'));
  }
  emitter.emit('dismissLoader');
}

async function addStaffMemberModal() {
  staffSelectedParties.value = staffParties.value;
  selectedPartyValues.value = JSON.parse(JSON.stringify(staffSelectedParties.value));
  staffQueryString.value = '';
  parties.value = [];
  showStaffModal.value = true;
  await findParties();
}

async function removePartyFromFacility(party: any) {
  emitter.emit('presentLoader');
  try {
    const resp = await mutations.removeParty({
      facilityId: party.facilityId,
      fromDate: party.fromDate,
      thruDate: DateTime.now().toMillis(),
      partyId: party.partyId,
      roleTypeId: party.roleTypeId
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate("Party was removed from facility.", { partyName: party.fullName, facilityName: current.value.facilityName }));
      await reloadAssociations();
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to remove party from facility', err);
    commonUtil.showToast(translate('Failed to remove party from facility'));
  }
  emitter.emit('dismissLoader');
}

async function addLocationModal() {
  const modal = await modalController.create({
    component: AddLocationModal,
    componentProps: { facilityId: props.facilityId },
  });
  modal.onDidDismiss().then(() => reloadAssociations());
  return modal.present();
}

async function openLocationDetailsPopover(ev: Event, location: any) {
  const popover = await popoverController.create({
    component: LocationDetailsPopover,
    componentProps: { location },
    event: ev,
    showBackdrop: false
  });
  // Locations are live per visit, so a remove/edit inside the popover is only visible after a reload.
  popover.onDidDismiss().then(() => reloadAssociations());
  return popover.present();
}

async function addFacilityGroupModal() {
  groupsToAdd.value = [];
  groupsToRemove.value = [];
  facilityGroupQueryString.value = '';
  await fetchFacilityGroups();
  showAddFacilityGroup.value = true;
}

async function removeFacilityFromGroup(facilityGroupId: string) {
  emitter.emit('presentLoader');
  const groupInformation = current.value.groupInformation.find((group: any) => group.facilityGroupId === facilityGroupId);
  try {
    const resp = await mutations.updateGroupAssociation({
      facilityId: current.value.facilityId,
      facilityGroupId,
      fromDate: groupInformation.fromDate,
      thruDate: DateTime.now().toMillis()
    });
    if (!commonUtil.hasError(resp)) {
      commonUtil.showToast(translate('Group unlinked from facility'));
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error('Failed to unlink group from facility', err);
    commonUtil.showToast(translate('Failed to unlink group'));
  }
  emitter.emit('dismissLoader');
}

function copyToClipboard(value: string) {
  navigator.clipboard.writeText(value);
  commonUtil.showToast(translate("Copied", { value }));
}

function getCurrentTime(zone: string, format = 't ZZZZ') {
  return DateTime.now().setZone(zone).toFormat(format);
}

function getDate(date: any) {
  return DateTime.fromMillis(date).toFormat('dd LLL yyyy');
}

function getOpenEndTime(startTime: any, capacity: any) {
  const openTime = DateTime.fromFormat(startTime, 'HH:mm:ss').toFormat('HH:mm a');
  const endTime = DateTime.fromMillis(DateTime.fromFormat(startTime, 'HH:mm:ss').toMillis() + capacity).toFormat('hh:mm a');
  return `${openTime} - ${endTime}`;
}

function getFacilityGroupTypeDesc(groupTypeId: string) {
  return facilityGroupTypes.value.find((groupType: any) => groupType.facilityGroupTypeId === groupTypeId)?.description || groupTypeId;
}

/* ----- Inline modal state (migrated from modal components) ----- */

// AddFacilityGroupModal
const showAddFacilityGroup = ref(false);
const facilityGroupsByType = ref({} as any);
const filteredFacilityGroupsByType = ref({} as any);
const groupsToAdd = ref([] as Array<string>);
const groupsToRemove = ref([] as Array<string>);
const facilityGroupQueryString = ref('');

// FacilityAddressModal
const showAddressModal = ref(false);
const address = ref({} as any);
const telecomNumberValue = ref({} as any);
const emailAddress = ref({} as any);
const facilityPostalAddress = postalAddress;
// States resolve through the cached GeoAssoc table rather than a per-country request.
// Keyed by country id because the template indexes it as `states[address.countryGeoId]` — the
// store it replaced was a `{ [geoId]: states[] }` map, and a flat array silently yields
// `undefined` (an empty dropdown that still holds a value it cannot render).
const states = computed<Record<string, any[]>>(() => {
  const countryGeoId = address.value?.countryGeoId || selectedCountryGeoId.value;
  return countryGeoId ? { [countryGeoId]: statesOf(countryGeoId) } : {};
});
const telecomAndEmailAddress = contactDetails;

// FacilityGeoPointModal
const showGeoPointModal = ref(false);
const geoPoint = ref({} as any);
const isGeneratingLatLong = ref(false);
const isPostalCodeChanged = ref(false);

// ViewFacilityOrderCountModal
const showFacilityOrderCountModal = ref(false);
const facilityOrderCounts = ref([] as Array<any>);
const isOrderCountLoading = ref(true);

// AddStaffMemberModal
const showStaffModal = ref(false);
const parties = ref([] as any);
const staffQueryString = ref('');
const staffSelectedParties = ref([] as any);
const selectedPartyValues = ref([] as any);
const staffPartyRoles = partyRoles; // cached roleTypes — same source the store fetched

// Shared by FacilityAddressModal and FacilityGeoPointModal
function validateZipCode(e: any) {
  if (/[`!@#$%^&*()_+=\\|,.<>?~{};:'"/]/.test(e.key)) {
    e.preventDefault();
    return false;
  }
}

/* ----- AddFacilityGroupModal ----- */

function closeAddFacilityGroup() {
  showAddFacilityGroup.value = false;
}

function updateGroupsForFacility(facilityGroupId: string) {
  if (isFacilityGroupLinked(facilityGroupId)) {
    if (groupsToRemove.value.includes(facilityGroupId)) {
      groupsToRemove.value.splice(groupsToRemove.value.indexOf(facilityGroupId), 1);
    } else {
      groupsToRemove.value.push(facilityGroupId);
    }
    return;
  }

  if (groupsToAdd.value.includes(facilityGroupId)) {
    groupsToAdd.value.splice(groupsToAdd.value.indexOf(facilityGroupId), 1);
  } else {
    groupsToAdd.value.push(facilityGroupId);
  }
}

async function updateGroups() {
  if (!groupsToAdd.value.length && !groupsToRemove.value.length) {
    commonUtil.showToast(translate('Please select/de-select groups to link/unlink from facility'));
    return;
  }

  emitter.emit("presentLoader");

  let isFacilityGroupRespHasError = false;

  const responses = await Promise.allSettled([
    ...groupsToAdd.value.map((groupId) => linkFacilityGroup(groupId)),
    ...groupsToRemove.value.map((groupId) => unlinkFacilityGroup(groupId))
  ]);

  isFacilityGroupRespHasError = responses.some(
    (response) => response.status === 'rejected'
  );

  if (isFacilityGroupRespHasError) {
    commonUtil.showToast(translate('Failed to update some groups for facility'));
  } else {
    commonUtil.showToast(translate('Updated groups for facility'));
  }
  emitter.emit("dismissLoader");
  closeAddFacilityGroup();
}

async function linkFacilityGroup(facilityGroupId: string) {
  try {
    const resp = await mutations.addToGroup({
      facilityId: current.value.facilityId,
      facilityGroupId
    });
    if (commonUtil.hasError(resp)) throw resp.data;
    return Promise.resolve(resp.data);
  } catch (err) {
    logger.error('Failed to add group to facility', err);
    return Promise.reject(err);
  }
}

async function unlinkFacilityGroup(facilityGroupId: string) {
  const groupInformation = current.value.groupInformation?.find((group: any) => group.facilityGroupId === facilityGroupId);
  try {
    const resp = await mutations.updateGroupAssociation({
      facilityId: current.value.facilityId,
      facilityGroupId,
      fromDate: groupInformation?.fromDate,
      thruDate: DateTime.now().toMillis()
    });
    if (commonUtil.hasError(resp)) throw resp.data;
    return Promise.resolve(resp.data);
  } catch (err) {
    logger.error('Failed to remove group from facility', err);
    return Promise.reject(err);
  }
}

async function fetchFacilityGroups() {
  try {
    const groups = allFacilityGroups.value;
    const newFacilityGroups = groups.reduce((groupsByType: any, group: any) => {
      const groupTypeId = !group.facilityGroupTypeId ? "Others" : group.facilityGroupTypeId;
      if (groupsByType[groupTypeId]) {
        groupsByType[groupTypeId].push(group);
      } else {
        groupsByType[groupTypeId] = [group];
      }
      return groupsByType;
    }, {});
    facilityGroupsByType.value = newFacilityGroups;
    filteredFacilityGroupsByType.value = facilityGroupsByType.value;
  } catch (err) {
    logger.error('Failed to find facility groups', err);
  }
}

function isFacilityGroupLinked(facilityGroupId: string) {
  return current.value.groupInformation?.some((group: any) => group.facilityGroupId === facilityGroupId);
}

function findGroups() {
  if (!facilityGroupQueryString.value.trim()) {
    filteredFacilityGroupsByType.value = facilityGroupsByType.value;
    return;
  }

  const keyword = facilityGroupQueryString.value.trim().toLowerCase();
  filteredFacilityGroupsByType.value = Object.values(facilityGroupsByType.value).reduce((filteredGroups: any, groups: any) => {
    groups.map((group: any) => {
      const groupId = group.facilityGroupId ? group.facilityGroupId.toLowerCase() : '';
      const groupName = group.facilityGroupName ? group.facilityGroupName.toLowerCase() : '';
      if (groupId.includes(keyword) || groupName.includes(keyword)) {
        const groupTypeId = group?.facilityGroupTypeId || "Others";
        if (filteredGroups[groupTypeId]) {
          filteredGroups[groupTypeId].push(group);
        } else {
          filteredGroups[groupTypeId] = [group];
        }
      }
    });
    return filteredGroups;
  }, {});
}

/* ----- FacilityAddressModal ----- */

function closeAddressModal() {
  showAddressModal.value = false;
}

function focusAddressInput() {
  const el = document.querySelector("#inputElement") as any;
  if (el) el.setFocus();
}

function isAddressUpdated() {
  if (!Object.keys(facilityPostalAddress.value).length) return true;
  return Object.entries(facilityPostalAddress.value).some(([addressKey, addressValue]) => address.value[addressKey] !== addressValue);
}

function isTelecomNumberUpdated() {
  return !Object.is(telecomNumberValue.value?.contactNumber, telecomAndEmailAddress.value?.telecomNumber?.contactNumber);
}

function isEmailAddressUpdated() {
  return emailAddress.value?.infoString && JSON.stringify(emailAddress.value.infoString) !== JSON.stringify(telecomAndEmailAddress.value?.emailAddress?.infoString);
}

async function saveTelecomNumber() {
  let resp = {} as any;
  const payload = {
    facilityId: props.facilityId,
    contactMechPurposeTypeId: 'PRIMARY_PHONE',
    contactNumber: telecomNumberValue.value.contactNumber?.trim() || '',
    countryCode: telecomNumberValue.value.countryCode?.replace('+', '') || ''
  };

  try {
    if (telecomAndEmailAddress.value.telecomNumber?.contactMechId) {
      resp = await mutations.updateTelecomNumber({
        ...payload,
        contactMechId: telecomAndEmailAddress.value.telecomNumber.contactMechId,
      });
    } else {
      resp = await mutations.createTelecomNumber(payload);
    }

    if (!commonUtil.hasError(resp)) {
      await reloadAssociations();
    } else {
      throw resp.data;
    }
  } catch (err) {
    // `saveContact` has usually already toasted "Facility contact updated successfully" for the
    // address by the time this runs, so swallowing the error tells the user the phone saved when
    // it did not.
    commonUtil.showToast(translate("Failed to update contact number."));
    logger.error(err);
  }
}

async function saveEmailAddress() {
  let resp = {} as any;
  const payload = {
    facilityId: props.facilityId,
    infoString: emailAddress.value.infoString
  };

  try {
    if (telecomAndEmailAddress.value.emailAddress?.contactMechId) {
      resp = await mutations.updateEmailAddress({
        ...payload,
        contactMechId: emailAddress.value.contactMechId,
        contactMechPurposeTypeId: 'PRIMARY_EMAIL'
      });
    } else {
      resp = await mutations.createEmailAddress({
        ...payload,
        contactMechTypeId: 'EMAIL_ADDRESS',
        contactMechPurposeTypeId: 'PRIMARY_EMAIL',
      });
    }

    if (!commonUtil.hasError(resp)) {
      await reloadAssociations();
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to update email address."));
    logger.error(err);
  }
}

async function saveContact() {
  let resp;
  let savedPostalAddress = '';

  if (!address.value?.address1 || !address.value?.city || !address.value?.postalCode) {
    commonUtil.showToast("Please fill all the required fields.");
    return;
  }

  if (emailAddress.value.infoString && !commonUtil.isValidEmail(emailAddress.value.infoString)) {
    commonUtil.showToast(translate("Invalid email address"));
    return;
  }

  emitter.emit('presentLoader');
  const telecomUpdated = isTelecomNumberUpdated();
  const emailUpdated = isEmailAddressUpdated();

  if (isAddressUpdated()) {
    try {
      if (address.value.contactMechId) {
        resp = await mutations.updatePostalAddress({ ...address.value, facilityId: props.facilityId, contactMechPurposeTypeId: 'PRIMARY_LOCATION' });
      } else {
        resp = await mutations.createPostalAddress({ ...address.value, facilityId: props.facilityId });
      }

      if (!commonUtil.hasError(resp)) {
        savedPostalAddress = address.value;
        await reloadAssociations();
        commonUtil.showToast(translate("Facility contact updated successfully."));
      } else {
        throw resp.data;
      }
    } catch (err) {
      commonUtil.showToast(translate("Failed to update facility contact."));
      logger.error(err);
    }
  }

  if (telecomUpdated) await saveTelecomNumber();
  if (emailUpdated) await saveEmailAddress();

  closeAddressModal();
  emitter.emit('dismissLoader');

  if (savedPostalAddress) {
    await fetchPostalCodeByGeoPoints();
  }
}

function updateState(ev: CustomEvent) {
  selectedCountryGeoId.value = ev.detail.value;
  const country = countries.value.find((country: any) => country.geoId === ev.detail.value);
  if (country) {
    telecomNumberValue.value.countryCode = commonUtil.getTelecomCountryCode(country.geoCode);
  }
}

/* ----- FacilityGeoPointModal ----- */

function closeGeoPointModal() {
  showGeoPointModal.value = false;
}

function postalCodeUpdate() {
  isPostalCodeChanged.value = geoPoint.value.postalCode !== facilityPostalAddress.value.postalCode;
}

async function generateLatLong() {
  if (!geoPoint.value.postalCode?.trim()) {
    commonUtil.showToast(translate("Please fill in the required Zipcode"));
    return;
  }
  isGeneratingLatLong.value = true;
  const postalCode = geoPoint.value.postalCode;

  try {
    const { latLongForPostalCode } = useGeocode();
    const result = await latLongForPostalCode(postalCode);

    if (result) {
      geoPoint.value.latitude = result.latitude;
      geoPoint.value.longitude = result.longitude;
    } else {
      throw new Error('Not found');
    }
  } catch (err) {
    commonUtil.showToast(translate("Unable to find the latitude and longitude for the entered zip code."));
    logger.error('Unable to find the latitude and longitude for the entered zip code.', err);
  }
  isGeneratingLatLong.value = false;
}

async function saveGeoPoint() {
  if (!geoPoint.value.latitude || !geoPoint.value.longitude) {
    commonUtil.showToast("Please fill all the required fields");
    return;
  }
  geoPoint.value.latitude = parseFloat(geoPoint.value.latitude);
  geoPoint.value.longitude = parseFloat(geoPoint.value.longitude);

  emitter.emit('presentLoader');

  let geoPointsResult = {} as any;

  try {
    const resp = await mutations.updatePostalAddress({
      ...geoPoint.value,
      postalCode: facilityPostalAddress.value.postalCode,
      facilityId: props.facilityId
    });

    if (!commonUtil.hasError(resp)) {
      geoPointsResult = geoPoint.value;
      commonUtil.showToast(translate("Facility latitude and longitude updated successfully."));
      await reloadAssociations();
    } else {
      throw resp.data;
    }
  } catch (err) {
    commonUtil.showToast(translate("Failed to update facility latitude and longitude."));
    logger.error(err);
  }

  closeGeoPointModal();
  emitter.emit('dismissLoader');

  if (geoPointsResult) {
    await fetchPostalCodeByGeoPoints();
  }
}

/* ----- ViewFacilityOrderCountModal ----- */

function closeFacilityOrderCountModal() {
  showFacilityOrderCountModal.value = false;
}

/* ----- AddStaffMemberModal ----- */

function closeStaffModal() {
  showStaffModal.value = false;
}

async function findParties() {
  emitter.emit('presentLoader');
  parties.value = [];
  try {
    const resp = await getPartyRoleAndPartyDetails({
      roleTypeId: 'APPLICATION_USER',
      keyword: staffQueryString.value || undefined,
      pageSize: import.meta.env.VITE_VIEW_SIZE || 20,
      pageIndex: 0
    });
    if (!commonUtil.hasError(resp)) {
      const docs = resp.data.parties || [];
      docs.map((party: any) => {
        party.fullName = party.groupName ? party.groupName : party.firstName ? `${party.firstName} ${party.lastName}` : '';
      });
      parties.value = docs;
    } else {
      throw resp.data;
    }
  } catch (err) {
    logger.error(err);
  }
  emitter.emit('dismissLoader');
}

async function saveParties() {
  emitter.emit('presentLoader');

  const partiesToAdd = selectedPartyValues.value.filter((selectedParty: any) => !staffSelectedParties.value.some((party: any) => party.partyId === selectedParty.partyId && party.roleTypeId === selectedParty.roleTypeId));
  const partiesToRemove = staffSelectedParties.value.filter((party: any) => !selectedPartyValues.value.some((selectedParty: any) => party.partyId === selectedParty.partyId));
  const partiesRoleChanged = staffSelectedParties.value.filter((party: any) => selectedPartyValues.value.some((selectedParty: any) => selectedParty.partyId === party.partyId && selectedParty.roleTypeId !== party.roleTypeId));
  partiesToRemove.push(...partiesRoleChanged);

  if (!(partiesToAdd.length > 0 || partiesToRemove.length > 0)) {
    commonUtil.showToast(translate("Please update atleast one party role."));
    emitter.emit('dismissLoader');
    return;
  }

  const removePromises = partiesToRemove.map((party: any) =>
    mutations.removeParty({
      facilityId: props.facilityId,
      fromDate: party.fromDate,
      thruDate: DateTime.now().toMillis(),
      partyId: party.partyId,
      roleTypeId: party.roleTypeId
    })
  );

  const addPromises = partiesToAdd.map((party: any) =>
    mutations.addParty({
      facilityId: props.facilityId,
      partyId: party.partyId,
      roleTypeId: party.roleTypeId
    })
  );

  const responses = await Promise.allSettled([...removePromises, ...addPromises]);
  const hasFailed = responses.some((response: any) => response.status === 'rejected');

  if (hasFailed) {
    commonUtil.showToast(translate("Failed to update some role(s)."));
  } else {
    commonUtil.showToast(translate("Role(s) updated successfully."));
  }

  await reloadAssociations();
  closeStaffModal();
  emitter.emit('dismissLoader');
}

function updateSelectedParties(event: CustomEvent, selectedPartyId: string) {
  let party = {} as any;
  const selectedRoleTypeId = event.detail.value;

  party = getParty(selectedPartyId);
  if (party?.partyId) {
    party = selectedPartyValues.value.find((p: any) => p.partyId === selectedPartyId);
    selectedPartyValues.value = selectedPartyValues.value.filter((p: any) => p.partyId !== selectedPartyId);

    if (selectedRoleTypeId) {
      selectedPartyValues.value.push({ ...party, roleTypeId: selectedRoleTypeId });
    }
  } else {
    party = parties.value.find((p: any) => p.partyId === selectedPartyId);
    selectedPartyValues.value.push({ ...party, roleTypeId: selectedRoleTypeId });
  }
}

function getParty(partyId: string) {
  return selectedPartyValues.value.find((party: any) => party.partyId === partyId);
}

function getPartyRoleTypeId(partyId: string) {
  const party = getParty(partyId);
  return party ? party.roleTypeId : '';
}

function isRoleUpdated() {
  const arePartiesUpdated = selectedPartyValues.value.length !== staffSelectedParties.value.length;
  return arePartiesUpdated || selectedPartyValues.value.some((selectedParty: any) => {
    const originalParty = staffSelectedParties.value.find((party: any) => party.partyId === selectedParty.partyId);
    return originalParty && selectedParty.roleTypeId !== originalParty.roleTypeId;
  });
}
</script>

<style scoped>
section {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  align-items: start;
}

.facility-details {
  grid-column: span 2;
}

ion-card-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

ion-segment {
  margin-top: var(--spacer-2xl);
  justify-content: start;
  margin-bottom: var(--spacer-lg)
}

.staff {
  --columns-desktop: 5;
  padding-block: var(--spacer-xs);
}

.external-mappings, .facility-info {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  align-items: start;
}

ion-card > ion-button[expand="block"] {
  margin-inline: var(--spacer-sm);
  margin-bottom: var(--spacer-sm);
}

.actions {
  display: flex;
  justify-content: space-between;
}

@media screen and (min-width: 700px) {
  ion-content > main {
    margin: var(--spacer-lg)
  }
}

.add-facility-group-modal ion-content,
.facility-address-modal ion-content,
.add-staff-member-modal ion-content {
  --padding-bottom: 80px;
}

.view-facility-order-count-modal ion-col {
  text-align: center;
}

.facility-geo-point-modal [data-spinner-size="small"] {
  transform: scale(0.5);
}
</style>
