<template>
  <ion-page>
    <ion-header :translucent="true">
      <ion-toolbar>
        <ion-menu-button slot="start" />
        <ion-title>{{ translate("Artifact Access") }}</ion-title>
        <ion-buttons slot="end">
          <ion-button :disabled="toolAccess.loading" @click="load">
            <ion-spinner v-if="toolAccess.loading" slot="icon-only" name="crescent" />
            <ion-icon v-else slot="icon-only" :icon="refreshOutline" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment v-model="activePanel" :scrollable="true">
          <ion-segment-button value="overview">
            <ion-label>{{ translate("Overview") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="tools">
            <ion-label>{{ translate("Tools") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="artifactGroups">
            <ion-label>{{ translate("Collections") }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="securityGroups">
            <ion-label>{{ translate("People") }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <section class="mission-board">
      <ion-card class="mission-status-card">
        <ion-card-header>
          <ion-card-title>{{ translate("Tool access mission control") }}</ion-card-title>
          <ion-card-subtitle>{{ selectedRouteSummary }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="full">
            <ion-item>
              <ion-icon slot="start" :icon="appsOutline" />
              <ion-label>
                <h2>{{ translate("Screen tools") }}</h2>
                <p>{{ protectedToolCount }} {{ translate("reachable") }} - {{ unprotectedToolCount }} {{ translate("without access") }}</p>
              </ion-label>
              <ion-badge slot="end" color="primary">{{ screenArtifactCount }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" :icon="albumsOutline" />
              <ion-label>
                <h2>{{ translate("Tool collections") }}</h2>
                <p>{{ collectionsWithAccessCount }} {{ translate("granted") }} - {{ uncoveredToolCollectionCount }} {{ translate("ungranted") }}</p>
              </ion-label>
              <ion-badge slot="end" color="primary">{{ artifactGroupCount }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" :icon="peopleOutline" />
              <ion-label>
                <h2>{{ translate("Security groups") }}</h2>
                <p>{{ securityGroupsWithToolsCount }} {{ translate("with tools") }} - {{ securityGroupsWithoutUserCount }} {{ translate("without users") }}</p>
              </ion-label>
              <ion-badge slot="end" color="primary">{{ userGroupCount }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
              <ion-label>
                <h2>{{ translate("Users with tool access") }}</h2>
                <p>{{ allowGrantCount }} {{ translate("active grants") }}</p>
              </ion-label>
              <ion-badge slot="end" color="primary">{{ usersWithToolAccessCount }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" :icon="alertCircleOutline" />
              <ion-label>
                <h2>{{ translate("Attention") }}</h2>
                <p>{{ attentionSummary }}</p>
              </ion-label>
              <ion-badge slot="end" :color="hasAttentionRows ? 'warning' : 'success'">{{ attentionRowCount }}</ion-badge>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-card v-if="toolAccess.loadError" class="mission-alert-card">
        <ion-card-header>
          <ion-card-title>{{ translate("Artifact access data did not load") }}</ion-card-title>
          <ion-card-subtitle>{{ translate("Moqui security entity access is required for this page.") }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="none">
            <ion-item>
              <ion-icon slot="start" :icon="shieldCheckmarkOutline" />
              <ion-label>
                <h2>{{ translate("Missing data") }}</h2>
                <p>{{ toolAccess.loadError }}</p>
                <p>{{ translate("The logged-in user needs Moqui access to UserGroup, UserGroupMember, ArtifactGroup, ArtifactGroupMember, ArtifactAuthz, and UserAccount.") }}</p>
              </ion-label>
            </ion-item>
          </ion-list>
        </ion-card-content>
      </ion-card>

      <ion-card class="route-console-card">
        <ion-card-header>
          <ion-card-title>{{ translate("Active access route") }}</ion-card-title>
          <ion-card-subtitle>{{ translate("Collection to security group to user") }}</ion-card-subtitle>
        </ion-card-header>
        <ion-card-content>
          <ion-list lines="full">
            <ion-item>
              <ion-icon slot="start" :icon="albumsOutline" />
              <ion-select
                v-model="selectedArtifactGroupId"
                interface="popover"
                :label="translate('Tool collection')"
                label-placement="stacked"
                :placeholder="translate('Select')"
              >
                <ion-select-option v-for="group in toolAccess.artifactGroups" :key="group.artifactGroupId" :value="group.artifactGroupId">
                  {{ formatArtifactGroup(group) }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-label>
                <h2>{{ selectedArtifactGroupLabel }}</h2>
                <p>{{ selectedArtifactGroupSummary }}</p>
              </ion-label>
              <ion-badge slot="end" color="medium">{{ selectedArtifactGroupMemberCount }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" :icon="peopleOutline" />
              <ion-select
                v-model="selectedUserGroupId"
                interface="popover"
                :label="translate('Security group')"
                label-placement="stacked"
                :placeholder="translate('Select')"
              >
                <ion-select-option v-for="group in toolAccess.userGroups" :key="group.userGroupId" :value="group.userGroupId">
                  {{ formatUserGroup(group) }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-label>
                <h2>{{ selectedUserGroupLabel }}</h2>
                <p>{{ selectedUserGroupSummary }}</p>
              </ion-label>
              <ion-badge slot="end" color="medium">{{ selectedUserGroupToolCount }}</ion-badge>
            </ion-item>
            <ion-item>
              <ion-icon slot="start" :icon="personAddOutline" />
              <ion-select
                v-model="selectedUserId"
                interface="popover"
                :label="translate('User')"
                label-placement="stacked"
                :placeholder="translate('Select')"
              >
                <ion-select-option v-for="user in filteredUsers" :key="user.userId" :value="user.userId">
                  {{ formatUser(user) }}
                </ion-select-option>
              </ion-select>
            </ion-item>
            <ion-item>
              <ion-label>
                <h2>{{ selectedUserLabel }}</h2>
                <p>{{ selectedUserSummary }}</p>
              </ion-label>
              <ion-badge slot="end" color="medium">{{ selectedUserToolCount }}</ion-badge>
            </ion-item>
          </ion-list>

          <ion-button expand="block" :disabled="!canGrantAccess || toolAccess.saving" @click="grantAccess">
            <ion-spinner v-if="toolAccess.saving" slot="start" name="crescent" />
            <ion-icon v-else slot="start" :icon="linkOutline" />
            {{ translate(accessAlreadyGranted ? "Grant already exists" : "Grant collection to security group") }}
          </ion-button>
          <ion-button expand="block" fill="outline" :disabled="!canAssignUser || toolAccess.saving" @click="assignUser">
            <ion-spinner v-if="toolAccess.saving" slot="start" name="crescent" />
            <ion-icon v-else slot="start" :icon="personAddOutline" />
            {{ translate(userAlreadyAssigned ? "Already associated" : "Assign user to security group") }}
          </ion-button>
        </ion-card-content>
      </ion-card>
      </section>

      <template v-if="activePanel === 'overview'">
        <section class="overview-board">
        <ion-card class="radar-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Access radar") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Coverage gaps and high-impact routes") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-list-header>
                <ion-label>{{ translate("Needs attention") }}</ion-label>
              </ion-list-header>
              <ion-item v-if="!hasAttentionRows">
                <ion-icon slot="start" :icon="checkmarkCircleOutline" />
                <ion-label>
                  <h2>{{ translate("No open access gaps") }}</h2>
                  <p>{{ translate("Every tool collection with tools has at least one security group grant.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item v-for="row in attentionRows" :key="row.key" button @click="openAttentionRow(row)">
                <ion-icon slot="start" :icon="row.icon" />
                <ion-label>
                  <h2>{{ row.title }}</h2>
                  <p>{{ row.detail }}</p>
                </ion-label>
                <ion-badge slot="end" :color="row.color">{{ row.count }}</ion-badge>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <ion-card class="matrix-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Collection access matrix") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Tool collections mapped to security groups and users") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-searchbar :placeholder="translate('Search artifact groups')" v-model="artifactGroupSearchQuery" />
            <ion-list lines="full">
              <ion-item v-if="!hasFilteredToolCollectionRows">
                <ion-label>{{ translate("No tool collections found") }}</ion-label>
              </ion-item>
              <ion-item v-for="row in filteredToolCollectionRows" :key="row.group.artifactGroupId" button @click="selectArtifactGroup(row.group.artifactGroupId)">
                <ion-icon slot="start" :icon="row.securityGroupCount ? shieldCheckmarkOutline : alertCircleOutline" />
                <ion-label>
                  <h2>{{ formatArtifactGroup(row.group) }}</h2>
                  <p>{{ row.toolCount }} {{ translate("tools") }} - {{ row.securityGroupCount }} {{ translate("security groups") }} - {{ row.userCount }} {{ translate("users") }}</p>
                </ion-label>
                <ion-chip slot="end" :color="row.securityGroupCount ? 'success' : 'warning'">{{ row.grantCount }}</ion-chip>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <ion-card class="coverage-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Security group coverage") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Teams mapped to tool collections") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-item v-for="row in securityGroupRows" :key="row.group.userGroupId" button @click="selectSecurityGroup(row.group.userGroupId)">
                <ion-icon slot="start" :icon="row.toolCount ? gitNetworkOutline : alertCircleOutline" />
                <ion-label>
                  <h2>{{ formatUserGroup(row.group) }}</h2>
                  <p>{{ row.memberCount }} {{ translate("users") }} - {{ row.collectionCount }} {{ translate("collections") }} - {{ row.toolCount }} {{ translate("tools") }}</p>
                </ion-label>
                <ion-badge slot="end" :color="row.toolCount ? 'primary' : 'medium'">{{ row.grantCount }}</ion-badge>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>
        </section>
      </template>

      <template v-else-if="activePanel === 'tools'">
        <section class="workbench-board">
        <ion-card class="create-tool-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Create screen tool") }}</ion-card-title>
            <ion-card-subtitle>{{ selectedArtifactGroupLabel }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-item>
                <ion-input
                  v-model="artifactDraft.artifactName"
                  fill="outline"
                  :label="translate('Screen path')"
                  label-placement="stacked"
                  :placeholder="translate('component://app/screen/Tool.xml')"
                />
              </ion-item>
              <ion-item>
                <ion-select
                  v-model="artifactDraft.artifactTypeEnumId"
                  interface="popover"
                  :label="translate('Artifact type')"
                  label-placement="stacked"
                >
                  <ion-select-option v-for="artifactType in artifactTypes" :key="artifactType.value" :value="artifactType.value">
                    {{ translate(artifactType.label) }}
                  </ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-toggle
                  :checked="artifactDraft.nameIsPattern === 'Y'"
                  @ionChange="artifactDraft.nameIsPattern = $event.detail.checked ? 'Y' : 'N'"
                >
                  {{ translate("Name is pattern") }}
                </ion-toggle>
              </ion-item>
              <ion-item>
                <ion-toggle
                  :checked="artifactDraft.inheritAuthz === 'Y'"
                  @ionChange="artifactDraft.inheritAuthz = $event.detail.checked ? 'Y' : 'N'"
                >
                  {{ translate("Inherit access") }}
                </ion-toggle>
              </ion-item>
            </ion-list>

            <ion-button expand="block" :disabled="!canAddArtifact || toolAccess.saving" @click="addArtifact">
              <ion-spinner v-if="toolAccess.saving" slot="start" name="crescent" />
              <ion-icon v-else slot="start" :icon="addCircleOutline" />
              {{ translate("Add to active collection") }}
            </ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card class="tool-registry-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Tool registry") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Screen artifacts by collection and user reach") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-searchbar :placeholder="translate('Search screen artifacts')" v-model="artifactSearchQuery" />
            <ion-list lines="full">
              <ion-item v-if="!hasFilteredScreenArtifacts">
                <ion-label>
                  <h2>{{ translate("No screen artifacts found") }}</h2>
                  <p>{{ translate("No tool artifacts match the current search.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item v-for="artifact in filteredScreenArtifacts" :key="artifact.key">
                <ion-label>
                  <ion-note>{{ formatArtifactType(artifact.artifactTypeEnumId) }}</ion-note>
                  <h2>{{ artifact.artifactName }}</h2>
                  <p>{{ artifactGroupCoverage(artifact) }}</p>
                  <p>{{ artifactAccessSummary(artifact) }}</p>
                </ion-label>
                <ion-select
                  slot="end"
                  v-model="artifactTargetGroupIds[artifact.key]"
                  interface="popover"
                  :placeholder="translate('Collection')"
                >
                  <ion-select-option v-for="group in toolAccess.artifactGroups" :key="group.artifactGroupId" :value="group.artifactGroupId">
                    {{ formatArtifactGroup(group) }}
                  </ion-select-option>
                </ion-select>
                <ion-button slot="end" fill="clear" :disabled="toolAccess.saving" @click="stageArtifact(artifact)">
                  <ion-icon slot="icon-only" :icon="locateOutline" />
                </ion-button>
                <ion-button
                  slot="end"
                  fill="clear"
                  :disabled="!getArtifactTargetGroupId(artifact) || isArtifactInGroup(artifact, getArtifactTargetGroupId(artifact)) || toolAccess.saving"
                  @click="assignArtifactToTargetGroup(artifact)"
                >
                  <ion-icon slot="icon-only" :icon="addCircleOutline" />
                </ion-button>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <ion-card class="active-tools-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Active collection tools") }}</ion-card-title>
            <ion-card-subtitle>{{ selectedArtifactGroupLabel }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-item v-if="!selectedArtifactGroupId">
                <ion-label>{{ translate("Select a tool collection") }}</ion-label>
              </ion-item>
              <ion-item v-else-if="!hasSelectedArtifactGroupMembers">
                <ion-label>
                  <h2>{{ translate("No artifacts found") }}</h2>
                  <p>{{ translate("This collection has no screen tools.") }}</p>
                </ion-label>
              </ion-item>
              <ion-item v-for="artifact in selectedArtifactGroupMembers" :key="`${artifact.artifactName}-${artifact.artifactTypeEnumId}`">
                <ion-label>
                  <h2>{{ artifact.artifactName }}</h2>
                  <p>{{ formatArtifactType(artifact.artifactTypeEnumId) }}</p>
                </ion-label>
                <ion-badge v-if="artifact.inheritAuthz !== 'N'" slot="end" color="medium">{{ translate("Inherited") }}</ion-badge>
                <ion-button
                  slot="end"
                  fill="clear"
                  color="danger"
                  :aria-label="translate('Remove artifact')"
                  :disabled="toolAccess.saving"
                  @click="removeArtifact(artifact)"
                >
                  <ion-icon slot="icon-only" :icon="trashOutline" />
                </ion-button>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>
        </section>
      </template>

      <template v-else-if="activePanel === 'artifactGroups'">
        <section class="collections-board">
        <ion-card class="grant-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Grant collection access") }}</ion-card-title>
            <ion-card-subtitle>{{ selectedRouteSummary }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-item>
                <ion-input
                  v-model="accessDraft.artifactAuthzId"
                  fill="outline"
                  :label="translate('Authorization ID')"
                  label-placement="stacked"
                />
              </ion-item>
              <ion-item>
                <ion-select
                  v-model="accessDraft.authzTypeEnumId"
                  interface="popover"
                  :label="translate('Authorization type')"
                  label-placement="stacked"
                >
                  <ion-select-option value="AUTHZT_ALWAYS">{{ translate("Always allow") }}</ion-select-option>
                  <ion-select-option value="AUTHZT_ALLOW">{{ translate("Allow") }}</ion-select-option>
                  <ion-select-option value="AUTHZT_DENY">{{ translate("Deny") }}</ion-select-option>
                </ion-select>
              </ion-item>
              <ion-item>
                <ion-select
                  v-model="accessDraft.authzActionEnumId"
                  interface="popover"
                  :label="translate('Action')"
                  label-placement="stacked"
                >
                  <ion-select-option value="AUTHZA_VIEW">{{ translate("View") }}</ion-select-option>
                  <ion-select-option value="AUTHZA_CREATE">{{ translate("Create") }}</ion-select-option>
                  <ion-select-option value="AUTHZA_UPDATE">{{ translate("Update") }}</ion-select-option>
                  <ion-select-option value="AUTHZA_DELETE">{{ translate("Delete") }}</ion-select-option>
                  <ion-select-option value="AUTHZA_ALL">{{ translate("All") }}</ion-select-option>
                </ion-select>
              </ion-item>
            </ion-list>

            <ion-button expand="block" :disabled="!canGrantAccess || toolAccess.saving" @click="grantAccess">
              <ion-spinner v-if="toolAccess.saving" slot="start" name="crescent" />
              <ion-icon v-else slot="start" :icon="linkOutline" />
              {{ translate(accessAlreadyGranted ? "Grant already exists" : "Grant collection to security group") }}
            </ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card class="create-collection-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Create tool collection") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Native Moqui artifact group") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-item>
                <ion-input
                  v-model="artifactGroupDraft.artifactGroupId"
                  fill="outline"
                  :label="translate('Artifact group ID')"
                  label-placement="stacked"
                  :placeholder="translate('CUSTOMER_SERVICE_TOOLS')"
                />
              </ion-item>
              <ion-item>
                <ion-input
                  v-model="artifactGroupDraft.description"
                  fill="outline"
                  :label="translate('Description')"
                  label-placement="stacked"
                  :placeholder="translate('Customer service tools')"
                />
              </ion-item>
            </ion-list>
            <ion-button expand="block" :disabled="toolAccess.saving" @click="createArtifactGroup">
              <ion-spinner v-if="toolAccess.saving" slot="start" name="crescent" />
              <ion-icon v-else slot="start" :icon="albumsOutline" />
              {{ translate("Create tool collection") }}
            </ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card class="collection-directory-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Tool collection directory") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Artifact groups with screen tools and security reach") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-searchbar :placeholder="translate('Search artifact groups')" v-model="artifactGroupSearchQuery" />
            <ion-list lines="full">
              <ion-item v-if="!hasFilteredArtifactGroupRows">
                <ion-label>{{ translate("No artifact groups found") }}</ion-label>
              </ion-item>
              <ion-item v-for="row in filteredArtifactGroupRows" :key="row.group.artifactGroupId" button @click="selectArtifactGroup(row.group.artifactGroupId)">
                <ion-icon slot="start" :icon="row.toolCount ? albumsOutline : gitNetworkOutline" />
                <ion-label>
                  <h2>{{ formatArtifactGroup(row.group) }}</h2>
                  <p>{{ row.toolCount }} {{ translate("tools") }} - {{ row.securityGroupCount }} {{ translate("security groups") }} - {{ row.userCount }} {{ translate("users") }}</p>
                </ion-label>
                <ion-chip slot="end" :color="row.securityGroupCount ? 'success' : 'medium'">{{ row.grantCount }}</ion-chip>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <ion-card class="grants-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Current access grants") }}</ion-card-title>
            <ion-card-subtitle>{{ selectedArtifactGroupLabel }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-item v-if="!hasSelectedArtifactGroupGrants">
                <ion-label>{{ translate("No grants found") }}</ion-label>
              </ion-item>
              <ion-item v-for="grant in selectedArtifactGroupGrants" :key="grant.artifactAuthzId">
                <ion-label>
                  <h2>{{ formatGrantUserGroup(grant.userGroupId) }}</h2>
                  <p>{{ formatAuthzType(grant.authzTypeEnumId) }} - {{ formatAuthzAction(grant.authzActionEnumId) }}</p>
                </ion-label>
                <ion-badge slot="end" color="primary">{{ grant.artifactAuthzId }}</ion-badge>
                <ion-button
                  slot="end"
                  fill="clear"
                  color="danger"
                  :aria-label="translate('Revoke access')"
                  :disabled="toolAccess.saving"
                  @click="revokeAccess(grant)"
                >
                  <ion-icon slot="icon-only" :icon="unlinkOutline" />
                </ion-button>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>
        </section>
      </template>

      <template v-else>
        <section class="people-board">
        <ion-card class="create-security-group-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Create security group") }}</ion-card-title>
            <ion-card-subtitle>{{ translate("Native Moqui user group") }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-item>
                <ion-input
                  v-model="securityGroupDraft.userGroupId"
                  fill="outline"
                  :label="translate('Security group ID')"
                  label-placement="stacked"
                  :placeholder="translate('CUSTOMER_SERVICE')"
                />
              </ion-item>
              <ion-item>
                <ion-input
                  v-model="securityGroupDraft.description"
                  fill="outline"
                  :label="translate('Description')"
                  label-placement="stacked"
                  :placeholder="translate('Customer service')"
                />
              </ion-item>
              <ion-item>
                <ion-input
                  v-model="securityGroupDraft.groupTypeEnumId"
                  fill="outline"
                  :label="translate('Group type')"
                  label-placement="stacked"
                  :placeholder="translate('Optional')"
                />
              </ion-item>
            </ion-list>

            <ion-button expand="block" :disabled="toolAccess.saving" @click="createSecurityGroup">
              <ion-spinner v-if="toolAccess.saving" slot="start" name="crescent" />
              <ion-icon v-else slot="start" :icon="peopleOutline" />
              {{ translate("Create security group") }}
            </ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card class="assign-user-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Add user to security group") }}</ion-card-title>
            <ion-card-subtitle>{{ selectedUserGroupLabel }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-searchbar :placeholder="translate('Search users')" v-model="userSearchQuery" />
            <ion-button expand="block" :disabled="!canAssignUser || toolAccess.saving" @click="assignUser">
              <ion-spinner v-if="toolAccess.saving" slot="start" name="crescent" />
              <ion-icon v-else slot="start" :icon="personAddOutline" />
              {{ translate(userAlreadyAssigned ? "Already associated" : "Assign user to security group") }}
            </ion-button>
          </ion-card-content>
        </ion-card>

        <ion-card class="roster-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Active security group roster") }}</ion-card-title>
            <ion-card-subtitle>{{ selectedUserGroupSummary }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-item v-if="!selectedUserGroupId">
                <ion-label>{{ translate("Select a security group") }}</ion-label>
              </ion-item>
              <ion-item v-else-if="!hasActiveGroupMembers">
                <ion-label>{{ translate("No active members") }}</ion-label>
              </ion-item>
              <ion-item v-for="member in activeGroupMembers" :key="`${member.userId}-${member.fromDate}`">
                <ion-label>
                  <h2>{{ member.userFullName || member.username || member.userId }}</h2>
                  <p>{{ member.emailAddress || member.userId }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  color="danger"
                  :aria-label="translate('Expire association')"
                  :disabled="toolAccess.saving"
                  @click="expireMembership(member)"
                >
                  <ion-icon slot="icon-only" :icon="unlinkOutline" />
                </ion-button>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <ion-card class="user-memberships-card">
          <ion-card-header>
            <ion-card-title>{{ translate("Selected user memberships") }}</ion-card-title>
            <ion-card-subtitle>{{ selectedUserLabel }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list lines="full">
              <ion-item v-if="!selectedUserId">
                <ion-label>{{ translate("Select a user") }}</ion-label>
              </ion-item>
              <ion-item v-else-if="!hasActiveUserMemberships">
                <ion-label>{{ translate("No active memberships") }}</ion-label>
              </ion-item>
              <ion-item v-for="membership in activeUserMemberships" :key="`${membership.userGroupId}-${membership.fromDate}`">
                <ion-label>
                  <h2>{{ formatGrantUserGroup(membership.userGroupId) }}</h2>
                  <p>{{ userGroupToolSummary(membership.userGroupId) }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  fill="clear"
                  color="danger"
                  :aria-label="translate('Expire association')"
                  :disabled="toolAccess.saving"
                  @click="expireMembership(membership)"
                >
                  <ion-icon slot="icon-only" :icon="unlinkOutline" />
                </ion-button>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>
        </section>
      </template>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import {
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardSubtitle,
  IonCardTitle,
  IonChip,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenuButton,
  IonNote,
  IonPage,
  IonSearchbar,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
  onIonViewWillEnter
} from "@ionic/vue";
import {
  addCircleOutline,
  albumsOutline,
  alertCircleOutline,
  appsOutline,
  checkmarkCircleOutline,
  gitNetworkOutline,
  linkOutline,
  locateOutline,
  peopleOutline,
  personAddOutline,
  refreshOutline,
  shieldCheckmarkOutline,
  trashOutline,
  unlinkOutline
} from "ionicons/icons";
import { commonUtil, translate } from "@common";
import { computed, reactive, ref, watch } from "vue";
import { useToolAccessStore } from "@/store/toolAccess";
import type {
  ArtifactAuthorization,
  ArtifactGroup,
  ArtifactGroupMember,
  SecurityUserAccount,
  SecurityUserGroup,
  SecurityUserGroupMember
} from "@/store/toolAccess";

type ScreenArtifact = ArtifactGroupMember & {
  key: string
  groupIds: string[]
}

type AttentionRow = {
  key: string
  title: string
  detail: string
  count: number
  color: string
  icon: string
}

const toolAccess = useToolAccessStore();

const activePanel = ref("overview");
const selectedUserGroupId = ref("");
const selectedUserId = ref("");
const selectedArtifactGroupId = ref("");
const userSearchQuery = ref("");
const artifactSearchQuery = ref("");
const artifactGroupSearchQuery = ref("");
const lastGeneratedAccessId = ref("");
const artifactTargetGroupIds = reactive<Record<string, string>>({});

const securityGroupDraft = reactive({
  userGroupId: "",
  description: "",
  groupTypeEnumId: ""
});

const artifactGroupDraft = reactive({
  artifactGroupId: "",
  description: ""
});

const artifactDraft = reactive({
  artifactName: "",
  artifactTypeEnumId: "AT_XML_SCREEN",
  nameIsPattern: "N",
  inheritAuthz: "Y"
});

const accessDraft = reactive({
  artifactAuthzId: "",
  authzTypeEnumId: "AUTHZT_ALWAYS",
  authzActionEnumId: "AUTHZA_VIEW"
});

const artifactTypes = [
  { value: "AT_XML_SCREEN", label: "Screen" },
  { value: "AT_XML_SCREEN_TRANS", label: "Screen transition" },
  { value: "AT_XML_SCREEN_CONTENT", label: "Screen content" },
  { value: "AT_SERVICE", label: "Service" },
  { value: "AT_ENTITY", label: "Entity" },
  { value: "AT_REST_PATH", label: "REST API path" },
  { value: "AT_OTHER", label: "Other" }
];

const screenArtifactTypeIds = new Set(["AT_XML_SCREEN", "AT_XML_SCREEN_TRANS", "AT_XML_SCREEN_CONTENT"]);

function getSearchText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function getListCount(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

const activeMemberships = computed(() =>
  toolAccess.userGroupMembers.filter((membership) => !membership.thruDate)
);

const activeGroupMembers = computed(() =>
  toolAccess.selectedGroupMembers.filter((member) => !member.thruDate)
);

const activeUserMemberships = computed(() =>
  toolAccess.selectedUserMemberships.filter((membership) => !membership.thruDate)
);

const allowGrantCount = computed(() =>
  toolAccess.artifactAuthz.filter((grant) => grant.authzTypeEnumId !== "AUTHZT_DENY").length
);

const userGroupsById = computed(() => {
  const groups = new Map<string, SecurityUserGroup>();
  toolAccess.userGroups.forEach((group) => groups.set(group.userGroupId, group));
  return groups;
});

const artifactGroupsById = computed(() => {
  const groups = new Map<string, ArtifactGroup>();
  toolAccess.artifactGroups.forEach((group) => groups.set(group.artifactGroupId, group));
  return groups;
});

const selectedArtifactGroup = computed(() =>
  artifactGroupsById.value.get(selectedArtifactGroupId.value)
);

const selectedUserGroup = computed(() =>
  userGroupsById.value.get(selectedUserGroupId.value)
);

const selectedUser = computed(() =>
  toolAccess.users.find((user) => user.userId === selectedUserId.value)
);

const selectedArtifactGroupMembers = computed(() =>
  toolAccess.selectedArtifactGroupMembers.filter((member) => !member.artifactTypeEnumId || screenArtifactTypeIds.has(member.artifactTypeEnumId))
);

const selectedArtifactGroupGrants = computed(() =>
  toolAccess.artifactAuthz.filter((grant) => grant.artifactGroupId === selectedArtifactGroupId.value)
);

const selectedUserGroupGrants = computed(() =>
  toolAccess.artifactAuthz.filter((grant) => grant.userGroupId === selectedUserGroupId.value)
);

const activeAllowGrants = computed(() =>
  toolAccess.artifactAuthz.filter((grant) => grant.authzTypeEnumId !== "AUTHZT_DENY")
);

const selectedArtifactGroupLabel = computed(() =>
  selectedArtifactGroup.value ? formatArtifactGroup(selectedArtifactGroup.value) : translate("No artifact group selected")
);

const selectedUserGroupLabel = computed(() =>
  selectedUserGroup.value ? formatUserGroup(selectedUserGroup.value) : translate("No security group selected")
);

const selectedUserLabel = computed(() =>
  selectedUser.value ? formatUser(selectedUser.value) : translate("No user selected")
);

const selectedArtifactGroupSummary = computed(() => {
  const grantCount = selectedArtifactGroupGrants.value.length;
  const userGroupCount = new Set(selectedArtifactGroupGrants.value.map((grant) => grant.userGroupId)).size;
  return `${selectedArtifactGroupMembers.value.length} ${translate("tools")} - ${grantCount} ${translate("grants")} - ${userGroupCount} ${translate("security groups")}`;
});

const selectedUserGroupSummary = computed(() => {
  const grantCount = selectedUserGroupGrants.value.length;
  return `${activeGroupMembers.value.length} ${translate("users")} - ${grantCount} ${translate("artifact group grants")}`;
});

const selectedUserGroupToolCount = computed(() =>
  getToolKeysForArtifactGroups(selectedUserGroupGrants.value.map((grant) => grant.artifactGroupId)).size
);

const selectedUserToolCount = computed(() =>
  getToolKeysForArtifactGroups(activeUserMemberships.value.flatMap((membership) =>
    activeAllowGrants.value
      .filter((grant) => grant.userGroupId === membership.userGroupId)
      .map((grant) => grant.artifactGroupId)
  )).size
);

const selectedUserSummary = computed(() =>
  selectedUserId.value
    ? `${activeUserMemberships.value.length} ${translate("security groups")} - ${selectedUserToolCount.value} ${translate("tools")}`
    : translate("No user selected")
);

const selectedRouteSummary = computed(() =>
  `${selectedArtifactGroupLabel.value} - ${selectedUserGroupLabel.value} - ${selectedUserLabel.value}`
);

const screenArtifacts = computed<ScreenArtifact[]>(() => {
  const artifacts = new Map<string, ScreenArtifact>();

  toolAccess.artifactGroupMembers
    .filter((member) => screenArtifactTypeIds.has(member.artifactTypeEnumId))
    .forEach((member) => {
      const key = `${member.artifactTypeEnumId}::${member.artifactName}`;
      const existing = artifacts.get(key);
      if (existing) {
        if (!existing.groupIds.includes(member.artifactGroupId)) existing.groupIds.push(member.artifactGroupId);
        return;
      }

      artifacts.set(key, {
        ...member,
        key,
        groupIds: [member.artifactGroupId]
      });
    });

  return Array.from(artifacts.values()).sort((a, b) => a.artifactName.localeCompare(b.artifactName));
});

const filteredScreenArtifacts = computed(() => {
  const query = getSearchText(artifactSearchQuery.value);
  if (!query) return screenArtifacts.value;

  return screenArtifacts.value.filter((artifact) => {
    return [
      artifact.artifactName,
      artifact.artifactTypeEnumId,
      ...artifact.groupIds
    ].some((value) => String(value || "").toLowerCase().includes(query));
  });
});

const artifactGroupRows = computed(() => {
  return toolAccess.artifactGroups.map((group) => {
    const tools = toolAccess.artifactGroupMembers.filter((member) =>
      member.artifactGroupId === group.artifactGroupId && screenArtifactTypeIds.has(member.artifactTypeEnumId)
    );
    const grants = activeAllowGrants.value.filter((grant) => grant.artifactGroupId === group.artifactGroupId);
    const userGroupIds = [...new Set(grants.map((grant) => grant.userGroupId))];
    const userIds = new Set(
      activeMemberships.value
        .filter((membership) => userGroupIds.includes(membership.userGroupId))
        .map((membership) => membership.userId)
    );

    return {
      group,
      toolCount: tools.length,
      grantCount: grants.length,
      securityGroupCount: userGroupIds.length,
      userCount: userIds.size
    };
  }).sort((a, b) => formatArtifactGroup(a.group).localeCompare(formatArtifactGroup(b.group)));
});

const securityGroupRows = computed(() => {
  return toolAccess.userGroups.map((group) => {
    const grants = activeAllowGrants.value.filter((grant) => grant.userGroupId === group.userGroupId);
    const artifactGroupIds = [...new Set(grants.map((grant) => grant.artifactGroupId))];
    const members = activeMemberships.value.filter((membership) => membership.userGroupId === group.userGroupId);

    return {
      group,
      grantCount: grants.length,
      collectionCount: artifactGroupIds.length,
      memberCount: members.length,
      toolCount: getToolKeysForArtifactGroups(artifactGroupIds).size
    };
  }).sort((a, b) => {
    if (b.toolCount !== a.toolCount) return b.toolCount - a.toolCount;
    return formatUserGroup(a.group).localeCompare(formatUserGroup(b.group));
  });
});

const collectionsWithAccessCount = computed(() =>
  artifactGroupRows.value.filter((row) => row.securityGroupCount > 0).length
);

const uncoveredToolCollections = computed(() =>
  artifactGroupRows.value.filter((row) => row.toolCount > 0 && row.securityGroupCount === 0)
);

const securityGroupsWithToolsCount = computed(() =>
  securityGroupRows.value.filter((row) => row.toolCount > 0).length
);

const securityGroupsWithoutUsers = computed(() =>
  securityGroupRows.value.filter((row) => row.toolCount > 0 && row.memberCount === 0)
);

const usersWithToolAccessCount = computed(() => {
  const grantedUserGroupIds = new Set(activeAllowGrants.value.map((grant) => grant.userGroupId));
  return new Set(
    activeMemberships.value
      .filter((membership) => grantedUserGroupIds.has(membership.userGroupId))
      .map((membership) => membership.userId)
  ).size;
});

const protectedToolCount = computed(() =>
  screenArtifacts.value.filter((artifact) => getArtifactAccessStats(artifact).userGroupCount > 0).length
);

const unprotectedToolCount = computed(() =>
  screenArtifacts.value.length - protectedToolCount.value
);

const attentionRows = computed(() => {
  const rows: AttentionRow[] = [];

  if (uncoveredToolCollections.value.length) {
    rows.push({
      key: "uncoveredToolCollections",
      title: translate("Collections without security grants"),
      detail: translate("Tool collections with tools and no security group grant"),
      count: uncoveredToolCollections.value.length,
      color: "warning",
      icon: alertCircleOutline
    });
  }

  if (securityGroupsWithoutUsers.value.length) {
    rows.push({
      key: "securityGroupsWithoutUsers",
      title: translate("Granted groups without users"),
      detail: translate("Security groups with tool access and no active users"),
      count: securityGroupsWithoutUsers.value.length,
      color: "warning",
      icon: peopleOutline
    });
  }

  return rows;
});

const attentionSummary = computed(() =>
  attentionRows.value.length
    ? `${attentionRows.value.length} ${translate("open access gaps")}`
    : translate("RBAC coverage is connected")
);

const filteredArtifactGroupRows = computed(() => {
  const query = getSearchText(artifactGroupSearchQuery.value);
  if (!query) return artifactGroupRows.value;

  return artifactGroupRows.value.filter((row) => {
    return [row.group.artifactGroupId, row.group.description]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
});

const toolCollectionRows = computed(() =>
  artifactGroupRows.value.filter((row) => row.toolCount > 0)
);

const filteredToolCollectionRows = computed(() => {
  const query = getSearchText(artifactGroupSearchQuery.value);
  if (!query) return toolCollectionRows.value;

  return toolCollectionRows.value.filter((row) => {
    return [row.group.artifactGroupId, row.group.description]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
});

const filteredUsers = computed(() => {
  const query = getSearchText(userSearchQuery.value);
  const users = query
    ? toolAccess.users.filter((user) => {
      return [user.userId, user.username, user.userFullName, user.emailAddress]
        .some((value) => String(value || "").toLowerCase().includes(query))
    })
    : toolAccess.users;

  return users.slice(0, 50);
});

const screenArtifactCount = computed(() => getListCount(screenArtifacts.value));
const artifactGroupCount = computed(() => getListCount(toolAccess.artifactGroups));
const userGroupCount = computed(() => getListCount(toolAccess.userGroups));
const uncoveredToolCollectionCount = computed(() => getListCount(uncoveredToolCollections.value));
const securityGroupsWithoutUserCount = computed(() => getListCount(securityGroupsWithoutUsers.value));
const attentionRowCount = computed(() => getListCount(attentionRows.value));
const selectedArtifactGroupMemberCount = computed(() => getListCount(selectedArtifactGroupMembers.value));
const hasAttentionRows = computed(() => attentionRowCount.value > 0);
const hasFilteredToolCollectionRows = computed(() => getListCount(filteredToolCollectionRows.value) > 0);
const hasFilteredScreenArtifacts = computed(() => getListCount(filteredScreenArtifacts.value) > 0);
const hasSelectedArtifactGroupMembers = computed(() => selectedArtifactGroupMemberCount.value > 0);
const hasFilteredArtifactGroupRows = computed(() => getListCount(filteredArtifactGroupRows.value) > 0);
const hasSelectedArtifactGroupGrants = computed(() => getListCount(selectedArtifactGroupGrants.value) > 0);
const hasActiveGroupMembers = computed(() => getListCount(activeGroupMembers.value) > 0);
const hasActiveUserMemberships = computed(() => getListCount(activeUserMemberships.value) > 0);

const userAlreadyAssigned = computed(() =>
  !!selectedUserGroupId.value
  && activeUserMemberships.value.some((membership) => membership.userGroupId === selectedUserGroupId.value)
);

const accessAlreadyGranted = computed(() =>
  activeAllowGrants.value.some((grant) =>
    grant.userGroupId === selectedUserGroupId.value
    && grant.artifactGroupId === selectedArtifactGroupId.value
    && (grant.authzActionEnumId === accessDraft.authzActionEnumId || grant.authzActionEnumId === "AUTHZA_ALL")
  )
);

const canAssignUser = computed(() => !!selectedUserId.value && !!selectedUserGroupId.value && !userAlreadyAssigned.value);
const canAddArtifact = computed(() => !!selectedArtifactGroupId.value && !!artifactDraft.artifactName.trim());
const canGrantAccess = computed(() =>
  !!selectedUserGroupId.value
  && !!selectedArtifactGroupId.value
  && !!accessDraft.artifactAuthzId.trim()
  && !accessAlreadyGranted.value
);

watch(selectedUserGroupId, async (userGroupId) => {
  await toolAccess.fetchUserGroupDetail(userGroupId);
  updateGeneratedAccessId();
});

watch(selectedUserId, async (userId) => {
  await toolAccess.fetchUserMemberships(userId);
});

watch(selectedArtifactGroupId, async (artifactGroupId) => {
  await toolAccess.fetchArtifactGroupDetail(artifactGroupId);
  updateGeneratedAccessId();
});

watch(() => accessDraft.authzActionEnumId, () => updateGeneratedAccessId());

onIonViewWillEnter(load);

async function load() {
  try {
    await toolAccess.fetchReferenceData();
    selectInitialWorkspace();
    if (selectedUserGroupId.value) await toolAccess.fetchUserGroupDetail(selectedUserGroupId.value);
    if (selectedUserId.value) await toolAccess.fetchUserMemberships(selectedUserId.value);
    if (selectedArtifactGroupId.value) await toolAccess.fetchArtifactGroupDetail(selectedArtifactGroupId.value);
  } catch {
    commonUtil.showToast(translate("Failed to load artifact access data"));
  }
}

function selectInitialWorkspace() {
  if (!selectedArtifactGroupId.value && toolAccess.artifactGroups.length) {
    const groupWithTools = artifactGroupRows.value.find((row) => row.toolCount > 0);
    selectedArtifactGroupId.value = groupWithTools?.group.artifactGroupId || toolAccess.artifactGroups[0].artifactGroupId;
  }

  if (!selectedUserGroupId.value) {
    const groupWithAccess = selectedArtifactGroupGrants.value[0]?.userGroupId;
    selectedUserGroupId.value = groupWithAccess || toolAccess.userGroups[0]?.userGroupId || "";
  }
}

function toMoquiId(value: string, fallback: string) {
  const normalized = value.trim().toUpperCase()
    .replace(/[^A-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return (normalized || fallback).slice(0, 40);
}

function updateGeneratedAccessId() {
  if (!selectedUserGroupId.value || !selectedArtifactGroupId.value) return;

  const nextId = toMoquiId(
    `${selectedUserGroupId.value}_${selectedArtifactGroupId.value}_${accessDraft.authzActionEnumId.replace("AUTHZA_", "")}`,
    "ARTIFACT_ACCESS"
  );

  if (!accessDraft.artifactAuthzId || accessDraft.artifactAuthzId === lastGeneratedAccessId.value) {
    accessDraft.artifactAuthzId = nextId;
    lastGeneratedAccessId.value = nextId;
  }
}

function formatUserGroup(group: SecurityUserGroup) {
  return group.description ? `${group.description} (${group.userGroupId})` : group.userGroupId;
}

function formatUser(user: SecurityUserAccount) {
  const label = user.userFullName || user.username || user.userId;
  return label === user.userId ? user.userId : `${label} (${user.userId})`;
}

function formatArtifactGroup(group: ArtifactGroup) {
  return group.description ? `${group.description} (${group.artifactGroupId})` : group.artifactGroupId;
}

function formatGrantGroup(artifactGroupId: string) {
  const group = artifactGroupsById.value.get(artifactGroupId);
  return group?.description ? `${group.description} (${artifactGroupId})` : artifactGroupId;
}

function formatGrantUserGroup(userGroupId: string) {
  const group = userGroupsById.value.get(userGroupId);
  return group?.description ? `${group.description} (${userGroupId})` : userGroupId;
}

function formatArtifactType(type: string) {
  return translate(artifactTypes.find((artifactType) => artifactType.value === type)?.label || type);
}

function formatAuthzType(type: string) {
  const labels: Record<string, string> = {
    AUTHZT_ALWAYS: "Always allow",
    AUTHZT_ALLOW: "Allow",
    AUTHZT_DENY: "Deny"
  };
  return translate(labels[type] || type);
}

function formatAuthzAction(action: string) {
  const labels: Record<string, string> = {
    AUTHZA_VIEW: "View",
    AUTHZA_CREATE: "Create",
    AUTHZA_UPDATE: "Update",
    AUTHZA_DELETE: "Delete",
    AUTHZA_ALL: "All"
  };
  return translate(labels[action] || action);
}

function artifactGroupCoverage(artifact: ScreenArtifact) {
  const labels = artifact.groupIds.slice(0, 3).map((artifactGroupId) => formatGrantGroup(artifactGroupId));
  const extra = artifact.groupIds.length > labels.length ? ` +${artifact.groupIds.length - labels.length}` : "";
  return labels.length ? `${translate("In")} ${labels.join(", ")}${extra}` : translate("Not assigned to any artifact group");
}

function artifactAccessSummary(artifact: ScreenArtifact) {
  const stats = getArtifactAccessStats(artifact);
  return `${stats.userGroupCount} ${translate("security groups")} - ${stats.userCount} ${translate("users")}`;
}

function getArtifactAccessStats(artifact: ScreenArtifact) {
  const grants = activeAllowGrants.value.filter((grant) => artifact.groupIds.includes(grant.artifactGroupId));
  const userGroupIds = [...new Set(grants.map((grant) => grant.userGroupId))];
  const userIds = new Set(
    activeMemberships.value
      .filter((membership) => userGroupIds.includes(membership.userGroupId))
      .map((membership) => membership.userId)
  );

  return {
    userGroupCount: userGroupIds.length,
    userCount: userIds.size
  };
}

function getToolKey(member: ArtifactGroupMember) {
  return `${member.artifactTypeEnumId}::${member.artifactName}`;
}

function getToolKeysForArtifactGroups(artifactGroupIds: string[]) {
  const groupIds = new Set(artifactGroupIds);
  return new Set(
    toolAccess.artifactGroupMembers
      .filter((member) => groupIds.has(member.artifactGroupId) && screenArtifactTypeIds.has(member.artifactTypeEnumId))
      .map((member) => getToolKey(member))
  );
}

function getArtifactTargetGroupId(artifact: ScreenArtifact) {
  return artifactTargetGroupIds[artifact.key] || selectedArtifactGroupId.value;
}

function isArtifactInGroup(artifact: ScreenArtifact, artifactGroupId: string) {
  return !!artifactGroupId && artifact.groupIds.includes(artifactGroupId);
}

function stageArtifact(artifact: ScreenArtifact) {
  artifactDraft.artifactName = artifact.artifactName;
  artifactDraft.artifactTypeEnumId = artifact.artifactTypeEnumId;
  artifactDraft.nameIsPattern = artifact.nameIsPattern || "N";
  artifactDraft.inheritAuthz = artifact.inheritAuthz || "Y";
}

function selectArtifactGroup(artifactGroupId: string) {
  selectedArtifactGroupId.value = artifactGroupId;
}

function selectSecurityGroup(userGroupId: string) {
  selectedUserGroupId.value = userGroupId;
}

function openAttentionRow(row: { key: string }) {
  if (row.key === "uncoveredToolCollections") {
    const next = uncoveredToolCollections.value[0];
    if (next) selectedArtifactGroupId.value = next.group.artifactGroupId;
    activePanel.value = "artifactGroups";
    return;
  }

  if (row.key === "securityGroupsWithoutUsers") {
    const next = securityGroupsWithoutUsers.value[0];
    if (next) selectedUserGroupId.value = next.group.userGroupId;
    activePanel.value = "securityGroups";
    return;
  }

  activePanel.value = "overview";
}

function userGroupToolSummary(userGroupId: string) {
  const row = securityGroupRows.value.find((groupRow) => groupRow.group.userGroupId === userGroupId);
  return row ? `${row.collectionCount} ${translate("collections")} - ${row.toolCount} ${translate("tools")}` : `0 ${translate("collections")} - 0 ${translate("tools")}`;
}

async function createSecurityGroup() {
  const userGroupId = toMoquiId(securityGroupDraft.userGroupId, "");
  if (!userGroupId) {
    commonUtil.showToast(translate("Enter a security group ID"));
    return;
  }

  try {
    await toolAccess.createUserGroup({
      userGroupId,
      description: securityGroupDraft.description,
      groupTypeEnumId: securityGroupDraft.groupTypeEnumId
    });
    selectedUserGroupId.value = userGroupId;
    securityGroupDraft.userGroupId = "";
    securityGroupDraft.description = "";
    securityGroupDraft.groupTypeEnumId = "";
    commonUtil.showToast(translate("Security group created"));
  } catch {
    commonUtil.showToast(translate("Failed to create security group"));
  }
}

async function assignUser() {
  if (!canAssignUser.value) return;

  try {
    await toolAccess.assignUserToGroup(selectedUserId.value, selectedUserGroupId.value);
    commonUtil.showToast(translate("User assigned to security group"));
  } catch {
    commonUtil.showToast(translate("Failed to assign user"));
  }
}

async function expireMembership(membership: SecurityUserGroupMember) {
  try {
    await toolAccess.expireUserGroupMembership(membership);
    commonUtil.showToast(translate("Association expired"));
  } catch {
    commonUtil.showToast(translate("Failed to expire association"));
  }
}

async function createArtifactGroup() {
  const artifactGroupId = toMoquiId(artifactGroupDraft.artifactGroupId, "");
  if (!artifactGroupId) {
    commonUtil.showToast(translate("Enter an artifact group ID"));
    return;
  }

  try {
    await toolAccess.createArtifactGroup({
      artifactGroupId,
      description: artifactGroupDraft.description
    });
    selectedArtifactGroupId.value = artifactGroupId;
    artifactGroupDraft.artifactGroupId = "";
    artifactGroupDraft.description = "";
    commonUtil.showToast(translate("Artifact group created"));
  } catch {
    commonUtil.showToast(translate("Failed to create artifact group"));
  }
}

async function addArtifact() {
  if (!canAddArtifact.value) return;

  try {
    await toolAccess.addArtifactToGroup({
      artifactGroupId: selectedArtifactGroupId.value,
      artifactName: artifactDraft.artifactName,
      artifactTypeEnumId: artifactDraft.artifactTypeEnumId,
      nameIsPattern: artifactDraft.nameIsPattern,
      inheritAuthz: artifactDraft.inheritAuthz
    });
    artifactDraft.artifactName = "";
    commonUtil.showToast(translate("Artifact added"));
  } catch {
    commonUtil.showToast(translate("Failed to add artifact"));
  }
}

async function assignArtifactToTargetGroup(artifact: ScreenArtifact) {
  const artifactGroupId = getArtifactTargetGroupId(artifact);
  if (!artifactGroupId) {
    commonUtil.showToast(translate("Select a tool collection"));
    return;
  }

  if (isArtifactInGroup(artifact, artifactGroupId)) {
    commonUtil.showToast(translate("Artifact already in collection"));
    return;
  }

  try {
    await toolAccess.addArtifactToGroup({
      artifactGroupId,
      artifactName: artifact.artifactName,
      artifactTypeEnumId: artifact.artifactTypeEnumId,
      nameIsPattern: artifact.nameIsPattern || "N",
      inheritAuthz: artifact.inheritAuthz || "Y"
    });
    selectedArtifactGroupId.value = artifactGroupId;
    artifactTargetGroupIds[artifact.key] = artifactGroupId;
    commonUtil.showToast(translate("Artifact added"));
  } catch {
    commonUtil.showToast(translate("Failed to add artifact"));
  }
}

async function removeArtifact(artifact: ArtifactGroupMember) {
  try {
    await toolAccess.removeArtifactFromGroup(artifact);
    commonUtil.showToast(translate("Artifact removed"));
  } catch {
    commonUtil.showToast(translate("Failed to remove artifact"));
  }
}

async function grantAccess() {
  if (!canGrantAccess.value) return;

  try {
    await toolAccess.grantArtifactGroupAccess({
      artifactAuthzId: accessDraft.artifactAuthzId,
      userGroupId: selectedUserGroupId.value,
      artifactGroupId: selectedArtifactGroupId.value,
      authzTypeEnumId: accessDraft.authzTypeEnumId,
      authzActionEnumId: accessDraft.authzActionEnumId
    });
    lastGeneratedAccessId.value = accessDraft.artifactAuthzId;
    commonUtil.showToast(translate("Artifact access linked"));
  } catch {
    commonUtil.showToast(translate("Failed to link artifact access"));
  }
}

async function revokeAccess(grant: ArtifactAuthorization) {
  try {
    await toolAccess.revokeArtifactGroupAccess(grant);
    commonUtil.showToast(translate("Artifact access revoked"));
  } catch {
    commonUtil.showToast(translate("Failed to revoke artifact access"));
  }
}
</script>

<style scoped>
.mission-board,
.overview-board,
.workbench-board,
.collections-board,
.people-board {
  display: grid;
  gap: 12px;
  align-items: start;
}

.mission-board {
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
}

.overview-board,
.workbench-board,
.collections-board,
.people-board {
  grid-template-columns: minmax(300px, 0.85fr) minmax(0, 1.15fr);
}

.mission-alert-card {
  grid-column: 1 / -1;
}

.route-console-card,
.radar-card,
.create-tool-card,
.grant-card,
.create-security-group-card {
  position: sticky;
  top: 12px;
}

.radar-card,
.tool-registry-card {
  grid-row: span 2;
}

.grants-card,
.user-memberships-card {
  grid-column: 2;
}

ion-card,
ion-item,
ion-label,
ion-select,
ion-searchbar {
  min-width: 0;
}

.tool-registry-card ion-select {
  min-width: 160px;
  max-width: 220px;
}

@media (max-width: 820px) {
  .mission-board,
  .overview-board,
  .workbench-board,
  .collections-board,
  .people-board {
    grid-template-columns: minmax(0, 1fr);
  }

  .route-console-card,
  .radar-card,
  .create-tool-card,
  .grant-card,
  .create-security-group-card {
    position: static;
  }

  .radar-card,
  .tool-registry-card,
  .grants-card,
  .user-memberships-card {
    grid-column: auto;
    grid-row: auto;
  }

  .tool-registry-card ion-select {
    min-width: 0;
    max-width: 100%;
  }
}
</style>
