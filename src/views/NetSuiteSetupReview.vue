<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/netsuite" />
        </ion-buttons>
        <ion-title>{{ translate("Review setup") }}</ion-title>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment scrollable :value="tab" @ion-change="openTab(String($event.detail.value))">
          <ion-segment-button v-for="reviewTab in REVIEW_TABS" :key="reviewTab.id" :value="reviewTab.id" :data-testid="`netsuite-review-tab-${reviewTab.id}`">
            <ion-label>{{ translate(reviewTab.label) }}<template v-if="actionCounts[reviewTab.id]"> ({{ actionCounts[reviewTab.id] }})</template></ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-item lines="none" data-testid="netsuite-review-last-save">
        <ion-label class="section-note">
          {{ lastSave ? translate("Last saved by {username}, {date}", { username: lastSave.username, date: commonUtil.getDateAndTime(lastSave.savedDate) }) : translate("Not saved yet.") }}
        </ion-label>
      </ion-item>

      <ion-card v-if="refusedRows.length" data-testid="netsuite-review-refused">
        <ion-card-header>
          <ion-card-title>{{ translate("Not saved") }}</ion-card-title>
        </ion-card-header>
        <ion-list lines="full">
          <ion-item v-for="refusedRow in refusedRows" :key="`${refusedRow.kind}-${refusedRow.id}-${refusedRow.reason}`">
            <ion-label class="ion-text-wrap">{{ refusedRowName(refusedRow) }}<p>{{ translate(REFUSAL_REASONS[refusedRow.reason] ?? refusedRow.reason) }}</p></ion-label>
          </ion-item>
        </ion-list>
      </ion-card>

      <ion-item v-if="focusedId && tab !== 'sharing'" lines="none" data-testid="netsuite-review-focused">
        <ion-label class="section-note">{{ translate("Showing one row.") }}</ion-label>
        <ion-button slot="end" fill="clear" data-testid="netsuite-review-show-all" @click="focusedId = undefined">{{ translate("Show all rows") }}</ion-button>
      </ion-item>

      <ion-card v-if="currentList.loadError.value" data-testid="netsuite-review-error">
        <ion-card-content>
          {{ translate("Could not read this list from NetSuite.") }}
          <p>{{ currentList.loadError.value }}</p>
        </ion-card-content>
      </ion-card>

      <ion-list v-if="currentList.isLoading.value">
        <ion-item><ion-skeleton-text :animated="true" /></ion-item>
      </ion-list>

      <template v-else-if="tab === 'subsidiaries'">
        <ion-item v-if="!shownSubsidiariesDiffer.length && !shownSubsidiariesByHand.length" lines="none" data-testid="netsuite-review-subsidiaries-done">
          <ion-label>{{ translate("Nothing needs action.") }}</ion-label>
        </ion-item>

        <template v-if="shownSubsidiariesDiffer.length">
          <div class="header ion-margin-top" data-testid="netsuite-review-subsidiaries-differ">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="businessOutline" />
              <ion-label>
                {{ translate("Company setup differs from NetSuite ({count})", { count: shownSubsidiariesDiffer.length }) }}
                <p>{{ translate("The OMS company does not have the roles or parent company NetSuite uses.") }}</p>
              </ion-label>
            </ion-item>
          </div>
          <ion-list-header class="results-header">
            <span class="results-header-start">
              <ion-checkbox :checked="allSubsidiariesSelected" :indeterminate="someSubsidiariesSelected && !allSubsidiariesSelected" :aria-label="translate('Select all')"
                data-testid="netsuite-review-subsidiaries-select-all" @ion-change="selectAllSubsidiaries(Boolean($event.detail.checked))" />
            </span>
            <ion-label>{{ translate(shownSubsidiariesDiffer.length === 1 ? "1 company" : "{count} companies", { count: shownSubsidiariesDiffer.length }) }}</ion-label>
          </ion-list-header>
          <div v-for="subsidiary in shownSubsidiariesDiffer" :key="subsidiary.subsidiaryId" class="list-item change-row ion-padding-end"
            :data-testid="`netsuite-review-subsidiary-${subsidiary.subsidiaryId}`" @click="toggleChoice(selectedSubsidiaryIds, subsidiary.subsidiaryId)">
            <ion-item lines="none">
              <ion-checkbox slot="start" :checked="selectedSubsidiaryIds.includes(subsidiary.subsidiaryId)" :aria-label="translate('Select company')" />
              <ion-label>
                {{ translate("{name} ({id})", { name: subsidiary.name, id: subsidiary.subsidiaryId }) }}
                <p>{{ subsidiary.partyId ?? translate("No OMS organization") }}</p>
              </ion-label>
            </ion-item>
            <ion-label class="row-changes">
              <p v-for="change in subsidiaryChanges(subsidiary)" :key="change">{{ change }}</p>
              <p v-if="subsidiary.differences.includes('PARENT_NOT_SET_UP')"><ion-text color="warning">{{ translate("Its parent company is not set up yet. Select it too.") }}</ion-text></p>
            </ion-label>
          </div>
        </template>

        <ion-accordion-group multiple :value="openSubsidiarySections" @ion-change="openSubsidiarySections = $event.detail.value ?? []">
          <ion-accordion v-if="shownSubsidiariesByHand.length" value="byHand" data-testid="netsuite-review-subsidiaries-by-hand">
            <ion-item slot="header">
              <ion-label>
                {{ translate("Fix by hand ({count})", { count: shownSubsidiariesByHand.length }) }}
                <p class="section-note">{{ translate("These need a change to an OMS organization. This page cannot fix them.") }}</p>
              </ion-label>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="subsidiary in shownSubsidiariesByHand" :key="subsidiary.subsidiaryId" :button="Boolean(subsidiary.partyId)" :detail="Boolean(subsidiary.partyId)"
                :data-testid="`netsuite-review-subsidiary-open-${subsidiary.subsidiaryId}`" @click="subsidiary.partyId && openOrganization(subsidiary.partyId)">
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("{name} ({id})", { name: subsidiary.name, id: subsidiary.subsidiaryId }) }}</h2>
                  <p v-if="subsidiary.partyId">{{ translate("OMS organization: {partyId}", { partyId: subsidiary.partyId }) }}</p>
                  <p v-for="difference in handFixDifferences(subsidiary)" :key="difference"><ion-text color="warning">{{ translate(HAND_FIX_MESSAGES[difference]) }}</ion-text></p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion v-if="shownSubsidiariesUnused.length" value="unused" data-testid="netsuite-review-subsidiaries-unused">
            <ion-item slot="header">
              <ion-label>
                {{ translate("NetSuite companies the OMS does not use ({count})", { count: shownSubsidiariesUnused.length }) }}
                <p class="section-note">{{ translate("For information. Nothing to do.") }}</p>
              </ion-label>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="subsidiary in shownSubsidiariesUnused" :key="subsidiary.subsidiaryId" :data-testid="`netsuite-review-subsidiary-${subsidiary.subsidiaryId}`">
                <ion-label class="ion-text-wrap">
                  {{ translate("{name} ({id})", { name: subsidiary.name, id: subsidiary.subsidiaryId }) }}
                  <p>{{ translate(subsidiary.isElimination === "Y" ? "Exists only for accounting." : "Inactive in NetSuite.") }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion v-if="shownSubsidiariesMatching.length" value="matching" data-testid="netsuite-review-subsidiaries-matching">
            <ion-item slot="header">
              <ion-label>{{ translate("Match NetSuite ({count})", { count: shownSubsidiariesMatching.length }) }}</ion-label>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="subsidiary in shownSubsidiariesMatching" :key="subsidiary.subsidiaryId" button detail
                :data-testid="`netsuite-review-subsidiary-open-${subsidiary.subsidiaryId}`" @click="openOrganization(subsidiary.partyId)">
                <ion-label class="ion-text-wrap">
                  <h2>{{ subsidiary.partyId }}</h2>
                  <p>{{ translate("NetSuite subsidiary {name} ({id})", { name: subsidiary.name, id: subsidiary.subsidiaryId }) }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>
      </template>

      <template v-else-if="tab === 'locations'">
        <ion-item v-if="!focusedId && !shownWrongCompany.length && !facilitiesWithoutId.length" lines="none" data-testid="netsuite-review-locations-done">
          <ion-label>{{ translate("Nothing needs action.") }}</ion-label>
        </ion-item>

        <template v-if="shownWrongCompany.length">
          <div class="header ion-margin-top" data-testid="netsuite-review-locations-wrong-company">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="businessOutline" />
              <ion-label>
                {{ translate("Company differs from NetSuite ({count})", { count: shownWrongCompany.length }) }}
                <p>{{ translate("The OMS company of these locations is not the company NetSuite uses.") }}</p>
              </ion-label>
            </ion-item>
          </div>
          <ion-list-header class="results-header">
            <span class="results-header-start">
              <ion-checkbox :checked="allWrongCompanySelected" :indeterminate="someWrongCompanySelected && !allWrongCompanySelected" :aria-label="translate('Select all')"
                data-testid="netsuite-review-locations-select-all" @ion-change="selectAllWrongCompany(Boolean($event.detail.checked))" />
            </span>
            <ion-label>{{ translate(shownWrongCompany.length === 1 ? "1 location" : "{count} locations", { count: shownWrongCompany.length }) }}</ion-label>
          </ion-list-header>
          <template v-for="location in shownWrongCompany" :key="location.netSuiteLocationId">
            <div v-for="facility in location.facilities" :key="facility.facilityId" class="list-item location-row ion-padding-end"
              :data-testid="`netsuite-review-location-${location.netSuiteLocationId}`" @click="toggleWrongCompanyRow(location)">
              <ion-item lines="none">
                <ion-checkbox slot="start" :checked="selectedLocationIds.includes(location.netSuiteLocationId)" :disabled="!canSaveLocation(location)" :aria-label="translate('Select location')" />
                <ion-label>
                  {{ facility.facilityName ?? facility.facilityId }}
                  <p>{{ facility.facilityId }}</p>
                </ion-label>
              </ion-item>
              <ion-label>
                {{ companyName(facility.ownerPartyId) ?? "-" }}
                <p>{{ translate("OMS company") }}</p>
              </ion-label>
              <ion-label>
                {{ subsidiaryName(location.subsidiaryId) }}
                <p>{{ translate("NetSuite company") }}</p>
              </ion-label>
            </div>
          </template>
        </template>

        <template v-if="!focusedId && facilitiesWithoutId.length">
          <div class="header ion-margin-top" data-testid="netsuite-review-locations-without-id">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="linkOutline" />
              <ion-label>
                {{ translate("OMS locations with no NetSuite id ({count})", { count: facilitiesWithoutId.length }) }}
                <p>{{ translate("Add the id of each one's NetSuite location.") }}</p>
              </ion-label>
            </ion-item>
          </div>
          <div v-for="facility in facilitiesWithoutId" :key="facility.facilityId" class="list-item id-row ion-padding-end"
            :data-testid="`netsuite-review-facility-${facility.facilityId}`">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="storefrontOutline" />
              <ion-label>
                {{ facility.facilityName ?? facility.facilityId }}
                <p>{{ facility.facilityId }}</p>
              </ion-label>
            </ion-item>
            <ion-label>
              -
              <p>{{ translate("NetSuite ID") }}</p>
            </ion-label>
            <ion-button size="small" fill="outline" :disabled="!locationSections.unused.length || isSaving"
              :data-testid="`netsuite-review-facility-add-id-${facility.facilityId}`" @click="chooseNetSuiteLocation(facility)">
              <ion-icon :icon="addOutline" />
              <ion-label>{{ translate("NetSuite ID") }}</ion-label>
            </ion-button>
          </div>
        </template>

        <ion-accordion-group multiple :value="openLocationSections" @ion-change="openLocationSections = $event.detail.value ?? []">
          <ion-accordion v-if="shownByHand.length || (!focusedId && facilitiesWithUnknownId.length)" value="byHand" data-testid="netsuite-review-locations-by-hand">
            <ion-item slot="header">
              <ion-label>
                {{ translate("Fix by hand ({count})", { count: byHandRowCount }) }}
                <p class="section-note">{{ translate("These need a change to the OMS location or in NetSuite. This page cannot fix them.") }}</p>
              </ion-label>
            </ion-item>
            <ion-list slot="content" lines="full">
              <template v-for="location in shownByHand" :key="location.netSuiteLocationId">
                <ion-item v-for="facility in location.facilities" :key="facility.facilityId" button detail
                  :data-testid="`netsuite-review-facility-open-${facility.facilityId}`" @click="openFacility(facility.facilityId)">
                  <ion-label class="ion-text-wrap">
                    <h2>{{ translate("{name} ({id})", { name: facility.facilityName ?? facility.facilityId, id: facility.facilityId }) }}</h2>
                    <p>{{ translate("NetSuite location {name} ({id})", { name: location.name, id: location.netSuiteLocationId }) }}</p>
                    <p v-for="warning in location.warnings" :key="warning"><ion-text color="warning">{{ translate(LOCATION_WARNINGS[warning] ?? warning) }}</ion-text></p>
                  </ion-label>
                </ion-item>
              </template>
              <template v-if="!focusedId">
                <ion-item v-for="facility in facilitiesWithUnknownId" :key="facility.facilityId" button detail
                  :data-testid="`netsuite-review-facility-open-${facility.facilityId}`" @click="openFacility(facility.facilityId)">
                  <ion-label class="ion-text-wrap">
                    <h2>{{ translate("{name} ({id})", { name: facility.facilityName ?? facility.facilityId, id: facility.facilityId }) }}</h2>
                    <p><ion-text color="warning">{{ translate("It has NetSuite id {id}, but NetSuite has no location with this id.", { id: facility.externalId }) }}</ion-text></p>
                  </ion-label>
                </ion-item>
              </template>
            </ion-list>
          </ion-accordion>

          <ion-accordion v-if="shownUnused.length" value="unused" data-testid="netsuite-review-locations-unused">
            <ion-item slot="header">
              <ion-label>
                {{ translate("NetSuite locations the OMS does not use ({count})", { count: shownUnused.length }) }}
                <p class="section-note">{{ translate("For information. Nothing to do unless the OMS needs one of them.") }}</p>
              </ion-label>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="location in shownUnused" :key="location.netSuiteLocationId" :data-testid="`netsuite-review-location-${location.netSuiteLocationId}`">
                <ion-label class="ion-text-wrap">
                  {{ translate("{name} ({id})", { name: location.name, id: location.netSuiteLocationId }) }}
                  <p>{{ subsidiaryName(location.subsidiaryId) }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion v-if="shownMatching.length" value="matching" data-testid="netsuite-review-locations-matching">
            <ion-item slot="header">
              <ion-label>{{ translate("Match NetSuite ({count})", { count: shownMatching.length }) }}</ion-label>
            </ion-item>
            <ion-list slot="content" lines="full">
              <template v-for="location in shownMatching" :key="location.netSuiteLocationId">
                <ion-item v-for="facility in location.facilities" :key="facility.facilityId" button detail
                  :data-testid="`netsuite-review-facility-open-${facility.facilityId}`" @click="openFacility(facility.facilityId)">
                  <ion-label class="ion-text-wrap">
                    <h2>{{ translate("{name} ({id})", { name: facility.facilityName ?? facility.facilityId, id: facility.facilityId }) }}</h2>
                    <p>{{ translate("NetSuite location {name} ({id})", { name: location.name, id: location.netSuiteLocationId }) }}</p>
                  </ion-label>
                </ion-item>
              </template>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>
      </template>

      <template v-else-if="tab === 'departments'">
        <ion-item v-if="!shownDepartmentsDiffer.length && (focusedId || !departmentsWithUnknownId.length)" lines="none" data-testid="netsuite-review-departments-done">
          <ion-label>{{ translate("Nothing needs action.") }}</ion-label>
        </ion-item>

        <template v-if="shownDepartmentsDiffer.length">
          <div class="header ion-margin-top" data-testid="netsuite-review-departments-differ">
            <ion-item lines="none">
              <ion-icon slot="start" :icon="peopleOutline" />
              <ion-label>
                {{ translate("Department differs from NetSuite ({count})", { count: shownDepartmentsDiffer.length }) }}
                <p>{{ translate("The OMS department does not have the name, roles or companies NetSuite uses.") }}</p>
              </ion-label>
            </ion-item>
          </div>
          <ion-list-header class="results-header">
            <span class="results-header-start">
              <ion-checkbox :checked="allDepartmentsSelected" :indeterminate="someDepartmentsSelected && !allDepartmentsSelected" :aria-label="translate('Select all')"
                data-testid="netsuite-review-departments-select-all" @ion-change="selectAllDepartments(Boolean($event.detail.checked))" />
            </span>
            <ion-label>{{ translate(shownDepartmentsDiffer.length === 1 ? "1 department" : "{count} departments", { count: shownDepartmentsDiffer.length }) }}</ion-label>
          </ion-list-header>
          <template v-for="department in shownDepartmentsDiffer" :key="department.departmentId">
            <div v-for="party in department.parties" :key="party.partyId" class="list-item change-row ion-padding-end"
              :data-testid="`netsuite-review-department-${department.departmentId}`" @click="toggleChoice(selectedDepartmentIds, department.departmentId)">
              <ion-item lines="none">
                <ion-checkbox slot="start" :checked="selectedDepartmentIds.includes(department.departmentId)" :aria-label="translate('Select department')" />
                <ion-label>
                  {{ party.groupName ?? party.partyId }}
                  <p>{{ party.partyId }}</p>
                  <p>{{ translate(party.locationCount === 1 ? "Used by 1 location" : "Used by {count} locations", { count: party.locationCount }) }}</p>
                </ion-label>
              </ion-item>
              <ion-label class="row-changes">
                <p v-for="change in departmentChanges(department, party)" :key="change">{{ change }}</p>
              </ion-label>
            </div>
          </template>
        </template>

        <ion-accordion-group multiple :value="openDepartmentSections" @ion-change="openDepartmentSections = $event.detail.value ?? []">
          <ion-accordion v-if="!focusedId && departmentsWithUnknownId.length" value="byHand" data-testid="netsuite-review-departments-by-hand">
            <ion-item slot="header">
              <ion-label>
                {{ translate("Fix by hand ({count})", { count: departmentsWithUnknownId.length }) }}
                <p class="section-note">{{ translate("These OMS departments have an id NetSuite does not have. This page cannot fix them.") }}</p>
              </ion-label>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="department in departmentsWithUnknownId" :key="department.partyId" button detail
                :data-testid="`netsuite-review-department-open-${department.partyId}`" @click="openOrganization(department.partyId)">
                <ion-label class="ion-text-wrap">
                  <h2>{{ translate("{name} ({id})", { name: department.groupName ?? department.partyId, id: department.partyId }) }}</h2>
                  <p><ion-text color="warning">{{ department.externalId ? translate("It has NetSuite id {id}, but NetSuite has no department with this id.", { id: department.externalId }) : translate("No NetSuite id") }}</ion-text></p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion v-if="shownDepartmentsUnused.length" value="unused" data-testid="netsuite-review-departments-unused">
            <ion-item slot="header">
              <ion-label>
                {{ translate("NetSuite departments the OMS does not use ({count})", { count: shownDepartmentsUnused.length }) }}
                <p class="section-note">{{ translate("For information. Nothing to do unless the OMS needs one of them.") }}</p>
              </ion-label>
            </ion-item>
            <ion-list slot="content" lines="full">
              <ion-item v-for="department in shownDepartmentsUnused" :key="department.departmentId" :data-testid="`netsuite-review-department-${department.departmentId}`">
                <ion-label class="ion-text-wrap">
                  {{ translate("{name} ({id})", { name: department.name, id: department.departmentId }) }}
                  <p>{{ departmentCompanies(department) }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-accordion>

          <ion-accordion v-if="shownDepartmentsMatching.length" value="matching" data-testid="netsuite-review-departments-matching">
            <ion-item slot="header">
              <ion-label>{{ translate("Match NetSuite ({count})", { count: shownDepartmentsMatching.length }) }}</ion-label>
            </ion-item>
            <ion-list slot="content" lines="full">
              <template v-for="department in shownDepartmentsMatching" :key="department.departmentId">
                <ion-item v-for="party in department.parties" :key="party.partyId" button detail
                  :data-testid="`netsuite-review-department-open-${party.partyId}`" @click="openOrganization(party.partyId)">
                  <ion-label class="ion-text-wrap">
                    <h2>{{ translate("{name} ({id})", { name: party.groupName ?? party.partyId, id: party.partyId }) }}</h2>
                    <p>{{ translate("NetSuite department {name} ({id})", { name: department.name, id: department.departmentId }) }}</p>
                  </ion-label>
                </ion-item>
              </template>
            </ion-list>
          </ion-accordion>
        </ion-accordion-group>
      </template>

      <template v-else-if="tab === 'sharing'">
        <ion-item lines="none">
          <ion-label class="ion-text-wrap section-note">{{ translate("NetSuite's records of which company may use another company's locations. For review only.") }}</ion-label>
        </ion-item>
        <ion-list lines="full" data-testid="netsuite-review-sharing">
          <ion-item v-if="isSharingOff" data-testid="netsuite-review-sharing-off"><ion-label class="ion-text-wrap">{{ translate("Cross-company location sharing is not switched on in this NetSuite account. Each company uses only its own locations.") }}</ion-label></ion-item>
          <ion-item v-else-if="!sharing.rows.value.length"><ion-label>{{ translate("NetSuite has no location sharing records.") }}</ion-label></ion-item>
          <ion-item v-for="group in sharingGroups" :key="group.originatingSubsidiaryId" :data-testid="`netsuite-review-sharing-${group.originatingSubsidiaryId}`">
            <ion-label class="ion-text-wrap">
              <h2>{{ translate("{company} may use the locations of:", { company: group.originatingSubsidiaryName }) }}</h2>
              <p v-for="relationship in group.relationships" :key="relationship.relationshipId">{{ sharingLine(relationship) }}</p>
            </ion-label>
          </ion-item>
        </ion-list>
      </template>
    </ion-content>

    <ion-footer v-if="tab === 'subsidiaries' && shownSubsidiariesDiffer.length" data-testid="netsuite-review-subsidiaries-footer">
      <ion-toolbar>
        <ion-title size="small">{{ selectedSubsidiaryIds.length }} {{ translate("selected") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="!selectedSubsidiaryIds.length || isSaving" data-testid="netsuite-review-subsidiaries-use-netsuite" @click="confirmSubsidiaryChange()">
            {{ translate("Use NetSuite") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>

    <ion-footer v-if="tab === 'locations' && shownWrongCompany.length" data-testid="netsuite-review-locations-footer">
      <ion-toolbar>
        <ion-title size="small">{{ selectedLocationIds.length }} {{ translate("selected") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="!selectedLocationIds.length || isSaving" data-testid="netsuite-review-locations-use-netsuite" @click="confirmCompanyChange()">
            {{ translate("Use NetSuite company") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>

    <ion-footer v-if="tab === 'departments' && shownDepartmentsDiffer.length" data-testid="netsuite-review-departments-footer">
      <ion-toolbar>
        <ion-title size="small">{{ selectedDepartmentIds.length }} {{ translate("selected") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="!selectedDepartmentIds.length || isSaving" data-testid="netsuite-review-departments-use-netsuite" @click="confirmDepartmentChange()">
            {{ translate("Use NetSuite") }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { useRoute } from "vue-router";
import {
  IonAccordion, IonAccordionGroup, IonBackButton, IonBadge, IonButton, IonButtons, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCheckbox, IonContent, IonFooter, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonPage, IonSegment, IonSegmentButton, IonSkeletonText, IonText, IonTitle, IonToolbar, alertController, modalController, onIonViewDidLeave, onIonViewWillEnter,
} from "@ionic/vue";
import { commonUtil, emitter, logger, translate } from "@common";
import { addOutline, businessOutline, linkOutline, peopleOutline, storefrontOutline } from "ionicons/icons";
import { activateSyncDomains, createSyncDomainOwner, deactivateSyncDomains } from "@/db/appDbSync";
import {
  NETSUITE_REVIEW_DEPARTMENTS_DOMAIN, NETSUITE_REVIEW_LOCATIONS_DOMAIN, NETSUITE_REVIEW_SHARING_DOMAIN, NETSUITE_REVIEW_SUBSIDIARIES_DOMAIN,
} from "@/config/appSyncConfig";
import { REFUSAL_REASONS, useNetSuiteSetupReview, useNetSuiteSetupReviewSave } from "@/composables/useNetSuiteSetupReview";
import type { NetSuiteSetupReviewChoices } from "@/composables/useNetSuiteSetupReview";
import SelectNetSuiteLocationModal from "@/components/netsuite-setup-review/SelectNetSuiteLocationModal.vue";
import router from "@/router";

const REVIEW_TABS = [
  { id: "subsidiaries", label: "Subsidiaries" },
  { id: "locations", label: "Locations" },
  { id: "departments", label: "Departments" },
  { id: "sharing", label: "Location sharing" },
];
const LOCATION_WARNINGS: Record<string, string> = {
  NETSUITE_LOCATION_INACTIVE: "Inactive in NetSuite, but an OMS location still has its id.",
  SHARED_NETSUITE_ID: "More than one OMS location has this NetSuite id.",
  COMPANY_NOT_SET_UP: "Its company is not set up in the OMS yet.",
};

const {
  subsidiaries, locations, departments, sharing, isSharingOff, departmentsWithUnknownId, facilitiesWithoutId, facilitiesWithUnknownId,
  subsidiarySections, locationSections, departmentSections, actionCounts, companyName, subsidiaryName,
} = useNetSuiteSetupReview();

const { lastSave, isSaving, loadLastSave, save } = useNetSuiteSetupReviewSave();

const route = useRoute();
const tab = ref("subsidiaries");
const focusedId = ref<string | undefined>();

function openTab(tabId: string) {
  tab.value = tabId;
  focusedId.value = undefined;
}
const openSubsidiarySections = ref<string[]>([]);
const openLocationSections = ref<string[]>([]);
const openDepartmentSections = ref<string[]>([]);
const refusedRows = ref<any[]>([]);

const canSaveLocation = (location: any) => location.reviewStatus === "DIFFERS" && location.isInactive !== "Y";


function toggleChoice(choices: string[], id: string) {
  const position = choices.indexOf(id);
  if (position >= 0) choices.splice(position, 1);
  else choices.push(id);
}

function refusedRowName(refusedRow: any) {
  const rowsByKind: Record<string, { rows: any[]; idField: string; label: string }> = {
    SUBSIDIARY: { rows: subsidiaries.rows.value, idField: "subsidiaryId", label: "Subsidiary {name} ({id})" },
    LOCATION: { rows: locations.rows.value, idField: "netSuiteLocationId", label: "NetSuite location {name} ({id})" },
    DEPARTMENT: { rows: departments.rows.value, idField: "departmentId", label: "Department {name} ({id})" },
  };
  const kind = rowsByKind[refusedRow.kind];
  const name = kind?.rows.find((row) => row[kind.idField] === refusedRow.id)?.name ?? "";
  return translate(kind?.label ?? "{name} ({id})", { name, id: refusedRow.id });
}

async function saveReviewRows(choices: Partial<NetSuiteSetupReviewChoices>, doneMessage: string) {
  emitter.emit("presentLoader");
  try {
    const { refusedRows: refused } = await save({ subsidiaryIds: [], locationIds: [], locationPicks: [], departmentIds: [], ...choices });
    refusedRows.value = refused;
    commonUtil.showToast(refused.length ? translate(REFUSAL_REASONS[refused[0].reason] ?? refused[0].reason) : doneMessage);
  } catch (error) {
    logger.error(error);
    commonUtil.showToast(`${translate("Nothing was saved.")} ${commonUtil.getErrorMessage(error)}`);
  }
  emitter.emit("dismissLoader");
}

const selectedLocationIds = ref<string[]>([]);
const selectableWrongCompanyIds = computed(() => shownWrongCompany.value.filter(canSaveLocation).map((location: any) => location.netSuiteLocationId));
const allWrongCompanySelected = computed(() => selectableWrongCompanyIds.value.length > 0
  && selectableWrongCompanyIds.value.every((netSuiteLocationId: string) => selectedLocationIds.value.includes(netSuiteLocationId)));
const someWrongCompanySelected = computed(() => selectableWrongCompanyIds.value.some((netSuiteLocationId: string) => selectedLocationIds.value.includes(netSuiteLocationId)));

function toggleWrongCompanyRow(location: any) {
  if (!canSaveLocation(location)) return;
  toggleChoice(selectedLocationIds.value, location.netSuiteLocationId);
}

function selectAllWrongCompany(isSelected: boolean) {
  selectedLocationIds.value = isSelected ? [...selectableWrongCompanyIds.value] : [];
}

async function confirmCompanyChange() {
  const chosenLocations = shownWrongCompany.value.filter((location: any) => selectedLocationIds.value.includes(location.netSuiteLocationId));
  const changes = chosenLocations.flatMap((location: any) => location.facilities.map((facility: any) => translate("{facility}: {from} → {to}", {
    facility: facility.facilityName ?? facility.facilityId,
    from: companyName(facility.ownerPartyId) ?? translate("none"),
    to: subsidiaryName(location.subsidiaryId),
  })));
  const alert = await alertController.create({
    header: translate("Use NetSuite company"),
    message: changes.join(". "),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: () => {
          const netSuiteLocationIds = chosenLocations.map((location: any) => location.netSuiteLocationId);
          selectedLocationIds.value = [];
          void saveReviewRows({ locationIds: netSuiteLocationIds }, translate("OMS company updated"));
        },
      },
    ],
  });
  await alert.present();
}

async function chooseNetSuiteLocation(facility: any) {
  const modal = await modalController.create({
    component: SelectNetSuiteLocationModal,
    componentProps: {
      facilityName: facility.facilityName ?? facility.facilityId,
      locations: locationSections.value.unused.map((location: any) => ({ netSuiteLocationId: location.netSuiteLocationId, name: location.name })),
    },
  });
  modal.onDidDismiss().then(({ data }: any) => {
    if (!data?.netSuiteLocationId) return;
    void saveReviewRows({ locationPicks: [{ netSuiteLocationId: data.netSuiteLocationId, facilityId: facility.facilityId }] }, translate("NetSuite ID updated"));
  });
  await modal.present();
}

function openFacility(facilityId: string) {
  router.push({ path: `/facility-details/${facilityId}` });
}

function openOrganization(partyId: string) {
  router.push({ path: `/organization-details/${partyId}` });
}

const DEPARTMENT_ROLE_NAMES: Record<string, string> = {
  INTERNAL_ORGANIZATION_ROLE_MISSING: "Internal Organization",
  DEPARTMENT_ROLE_MISSING: "Department",
};

const departmentCompanies = (department: any) => department.companySubsidiaryIds.map((subsidiaryId: string) => subsidiaryName(subsidiaryId)).join(", ");

function departmentChanges(department: any, party: any) {
  const changes: string[] = [];
  if (party.differences.includes("NAME_DIFFERS")) {
    changes.push(translate("Name: {from} → {to}", { from: party.groupName ?? translate("none"), to: department.name }));
  }
  const missingRoles = Object.keys(DEPARTMENT_ROLE_NAMES).filter((difference) => party.differences.includes(difference));
  if (missingRoles.length) {
    const heldRoles = Object.keys(DEPARTMENT_ROLE_NAMES).filter((difference) => !missingRoles.includes(difference));
    changes.push(translate("Roles: {from} → {to}", {
      from: heldRoles.map((difference) => translate(DEPARTMENT_ROLE_NAMES[difference])).join(", ") || translate("none"),
      to: Object.values(DEPARTMENT_ROLE_NAMES).map((roleName) => translate(roleName)).join(", "),
    }));
  }
  if (party.differences.includes("COMPANY_LINK_MISSING") || party.differences.includes("EXTRA_COMPANY_LINK")) {
    changes.push(translate("Companies: {from} → {to}", {
      from: party.currentCompanyPartyIds.map((partyId: string) => companyName(partyId)).join(", ") || translate("none"),
      to: departmentCompanies(department),
    }));
  }
  return changes;
}

const selectedDepartmentIds = ref<string[]>([]);
const shownDepartmentIds = computed(() => shownDepartmentsDiffer.value.map((department: any) => department.departmentId));
const allDepartmentsSelected = computed(() => shownDepartmentIds.value.length > 0
  && shownDepartmentIds.value.every((departmentId: string) => selectedDepartmentIds.value.includes(departmentId)));
const someDepartmentsSelected = computed(() => shownDepartmentIds.value.some((departmentId: string) => selectedDepartmentIds.value.includes(departmentId)));

function selectAllDepartments(isSelected: boolean) {
  selectedDepartmentIds.value = isSelected ? [...shownDepartmentIds.value] : [];
}

async function confirmDepartmentChange() {
  const chosenDepartments = shownDepartmentsDiffer.value.filter((department: any) => selectedDepartmentIds.value.includes(department.departmentId));
  const changes = chosenDepartments.flatMap((department: any) => department.parties.map((party: any) => translate("{department}: {changes}", {
    department: party.groupName ?? party.partyId,
    changes: departmentChanges(department, party).join("; "),
  })));
  const alert = await alertController.create({
    header: translate("Use NetSuite"),
    message: changes.join(". "),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: () => {
          const departmentIds = chosenDepartments.map((department: any) => department.departmentId);
          selectedDepartmentIds.value = [];
          void saveReviewRows({ departmentIds }, translate("Departments updated"));
        },
      },
    ],
  });
  await alert.present();
}

const listsByTab: Record<string, any> = { subsidiaries, locations, departments, sharing };
const currentList = computed(() => listsByTab[tab.value]);

const focusedSubsidiaries = (rows: any[]) => (focusedId.value ? rows.filter((row) => row.subsidiaryId === focusedId.value) : rows);
const shownSubsidiariesDiffer = computed(() => focusedSubsidiaries(subsidiarySections.value.differs));
const shownSubsidiariesByHand = computed(() => focusedSubsidiaries(subsidiarySections.value.byHand));
const shownSubsidiariesUnused = computed(() => focusedSubsidiaries(subsidiarySections.value.unused));
const shownSubsidiariesMatching = computed(() => focusedSubsidiaries(subsidiarySections.value.matching));
const focusedLocations = (rows: any[]) => (focusedId.value ? rows.filter((row) => row.netSuiteLocationId === focusedId.value) : rows);
const shownWrongCompany = computed(() => focusedLocations(locationSections.value.wrongCompany));
const shownByHand = computed(() => focusedLocations(locationSections.value.byHand));
const byHandRowCount = computed(() => shownByHand.value.reduce((count: number, location: any) => count + location.facilities.length, 0)
  + (focusedId.value ? 0 : facilitiesWithUnknownId.value.length));
const shownUnused = computed(() => focusedLocations(locationSections.value.unused));
const shownMatching = computed(() => focusedLocations(locationSections.value.matching));
const focusedDepartments = (rows: any[]) => (focusedId.value ? rows.filter((row) => row.departmentId === focusedId.value) : rows);
const shownDepartmentsDiffer = computed(() => focusedDepartments(departmentSections.value.differs));
const shownDepartmentsUnused = computed(() => focusedDepartments(departmentSections.value.unused));
const shownDepartmentsMatching = computed(() => focusedDepartments(departmentSections.value.matching));

const HAND_FIX_MESSAGES: Record<string, string> = {
  ELIMINATION_HAS_ORGANIZATION: "An organization holds this id, but this subsidiary exists only for accounting and should have none.",
  MORE_THAN_ONE_ORGANIZATION: "More than one organization holds this id.",
};
const handFixDifferences = (subsidiary: any) => subsidiary.differences.filter((difference: string) => HAND_FIX_MESSAGES[difference]);

const COMPANY_ROLE_NAMES = { internal: "Internal Organization", subsidiary: "Subsidiary", parent: "Parent Organization" };

function subsidiaryChanges(subsidiary: any) {
  const hasChildCompanies = subsidiaries.rows.value.some((row: any) => row.parentId === subsidiary.subsidiaryId && row.isElimination !== "Y");
  const neededRoles = [COMPANY_ROLE_NAMES.internal, COMPANY_ROLE_NAMES.subsidiary, ...(hasChildCompanies ? [COMPANY_ROLE_NAMES.parent] : [])];
  const changes: string[] = [];
  const neededRoleText = neededRoles.map((roleName) => translate(roleName)).join(", ");
  if (!subsidiary.partyId) {
    changes.push(translate("Organization: none → new organization"));
    changes.push(translate("Roles: {from} → {to}", { from: translate("none"), to: neededRoleText }));
  } else {
    const missingRoles = [
      ...(subsidiary.differences.includes("SUBSIDIARY_ROLE_MISSING") ? [COMPANY_ROLE_NAMES.subsidiary] : []),
      ...(subsidiary.differences.includes("PARENT_ROLE_MISSING") ? [COMPANY_ROLE_NAMES.parent] : []),
    ];
    if (missingRoles.length) {
      const heldRoles = neededRoles.filter((roleName) => !missingRoles.includes(roleName));
      changes.push(translate("Roles: {from} → {to}", { from: heldRoles.map((roleName) => translate(roleName)).join(", ") || translate("none"), to: neededRoleText }));
    }
  }
  const currentParents = subsidiary.currentParentPartyIds.map((partyId: string) => companyName(partyId)).join(", ");
  const expectedParent = subsidiary.parentId ? subsidiaryName(subsidiary.parentId) : "";
  const parentChanges = (!subsidiary.partyId && subsidiary.parentId)
    || subsidiary.differences.includes("PARENT_DIFFERS") || subsidiary.differences.includes("PARENT_NOT_SET_UP");
  if (parentChanges) {
    changes.push(translate("Parent: {from} → {to}", { from: currentParents || translate("none"), to: expectedParent || translate("none") }));
  }
  return changes;
}

const selectedSubsidiaryIds = ref<string[]>([]);
const shownSubsidiaryIds = computed(() => shownSubsidiariesDiffer.value.map((subsidiary: any) => subsidiary.subsidiaryId));
const allSubsidiariesSelected = computed(() => shownSubsidiaryIds.value.length > 0
  && shownSubsidiaryIds.value.every((subsidiaryId: string) => selectedSubsidiaryIds.value.includes(subsidiaryId)));
const someSubsidiariesSelected = computed(() => shownSubsidiaryIds.value.some((subsidiaryId: string) => selectedSubsidiaryIds.value.includes(subsidiaryId)));

function selectAllSubsidiaries(isSelected: boolean) {
  selectedSubsidiaryIds.value = isSelected ? [...shownSubsidiaryIds.value] : [];
}

async function confirmSubsidiaryChange() {
  const chosenSubsidiaries = shownSubsidiariesDiffer.value.filter((subsidiary: any) => selectedSubsidiaryIds.value.includes(subsidiary.subsidiaryId));
  const changes = chosenSubsidiaries.map((subsidiary: any) => translate("{company}: {changes}", {
    company: subsidiary.name,
    changes: subsidiaryChanges(subsidiary).join("; "),
  }));
  const alert = await alertController.create({
    header: translate("Use NetSuite"),
    message: changes.join(". "),
    buttons: [
      { text: translate("Cancel"), role: "cancel" },
      {
        text: translate("Apply"),
        handler: () => {
          const subsidiaryIds = chosenSubsidiaries.map((subsidiary: any) => subsidiary.subsidiaryId);
          selectedSubsidiaryIds.value = [];
          void saveReviewRows({ subsidiaryIds }, translate("Companies updated"));
        },
      },
    ],
  });
  await alert.present();
}

const sharingGroups = computed(() => {
  const groups = new Map<string, { originatingSubsidiaryId: string; originatingSubsidiaryName: string; relationships: any[] }>();
  sharing.rows.value.forEach((relationship: any) => {
    const group = groups.get(relationship.originatingSubsidiaryId)
      ?? { originatingSubsidiaryId: relationship.originatingSubsidiaryId, originatingSubsidiaryName: relationship.originatingSubsidiaryName, relationships: [] };
    group.relationships.push(relationship);
    groups.set(relationship.originatingSubsidiaryId, group);
  });
  return [...groups.values()]
    .map((group) => ({ ...group, relationships: [...group.relationships].sort((first, second) => String(first.inventorySubsidiaryName).localeCompare(String(second.inventorySubsidiaryName))) }))
    .sort((first, second) => String(first.originatingSubsidiaryName).localeCompare(String(second.originatingSubsidiaryName)));
});

function sharingLimit(kind: "Shipping" | "Returns", isAllowed: string, isAllLocations: string) {
  if (isAllowed !== "Y") return translate(`${kind} not allowed`);
  return isAllLocations === "Y" ? "" : translate(`${kind} at chosen locations only`);
}

function sharingLine(relationship: any) {
  if (relationship.isInactive === "Y") return translate("{company}: rule inactive", { company: relationship.inventorySubsidiaryName });
  const limits = [
    sharingLimit("Shipping", relationship.allowsFulfillment, relationship.allLocationsForFulfillment),
    sharingLimit("Returns", relationship.allowsCustomerReturn, relationship.allLocationsForCustomerReturn),
  ].filter(Boolean);
  return limits.length
    ? translate("{company}: {limits}", { company: relationship.inventorySubsidiaryName, limits: limits.join(", ") })
    : relationship.inventorySubsidiaryName;
}

const SYNC_OWNER = createSyncDomainOwner("netSuiteSetupReview");
const REVIEW_DOMAINS = [
  { name: NETSUITE_REVIEW_SUBSIDIARIES_DOMAIN },
  { name: NETSUITE_REVIEW_LOCATIONS_DOMAIN },
  { name: NETSUITE_REVIEW_DEPARTMENTS_DOMAIN },
  { name: NETSUITE_REVIEW_SHARING_DOMAIN },
];

onIonViewWillEnter(() => {
  const requestedTab = String(route.query.tab ?? "");
  if (REVIEW_TABS.some((reviewTab) => reviewTab.id === requestedTab)) tab.value = requestedTab;
  focusedId.value = route.query.id ? String(route.query.id) : undefined;
  openLocationSections.value = focusedId.value ? ["byHand", "unused", "matching"] : [];
  openDepartmentSections.value = focusedId.value ? ["unused", "matching"] : [];
  openSubsidiarySections.value = focusedId.value ? ["byHand", "unused", "matching"] : [];
  void activateSyncDomains(REVIEW_DOMAINS, SYNC_OWNER);
  loadLastSave().catch((error) => logger.error("Could not read the last save of the NetSuite setup review", error));
});
onIonViewDidLeave(() => { void deactivateSyncDomains(SYNC_OWNER); });
</script>

<style scoped>

.location-row {
  --columns-desktop: 3;
  cursor: pointer;
}

.results-header {
  align-items: center;
  display: flex;
  gap: var(--spacer-sm);
}

.results-header-start {
  display: flex;
  min-width: 24px;
}

.id-row {
  --columns-desktop: 3;
}

.change-row {
  --columns-desktop: 2;
  cursor: pointer;
}

.row-changes {
  text-align: end;
}

.section-note {
  color: var(--ion-color-medium);
}
</style>
