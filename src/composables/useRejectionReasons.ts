import { DateTime } from "luxon";
import { ref } from "vue";
import { api, commonUtil, logger, translate } from "@common";

export function useRejectionReasons() {
  const rejectReasons = ref<any[]>([]);
  const rejectReasonEnumTypes = ref<any[]>([]);
  const filteredReasons = ref<any[]>([]);
  const groupRejectReasons = ref<Record<string, Record<string, any>>>({
    FF_REJ_RSN_GRP: {},
    BOPIS_REJ_RSN_GRP: {}
  });
  const isFetching = ref(false);

  async function fetchRejectReasons() {
    isFetching.value = true;
    let reasons: any[] = [];
    try {
      const payload = {
        parentTypeId: ["REPORT_AN_ISSUE", "RPRT_NO_VAR_LOG"],
        parentTypeId_op: "in",
        pageSize: 100,
        orderByField: "sequenceNum"
      };

      const resp: any = await api({
        url: "/admin/enums",
        method: "GET",
        params: payload,
      });

      if (!commonUtil.hasError(resp)) {
        reasons = resp.data || [];
      } else {
        throw resp.data;
      }
    } catch (err) {
      logger.error("Failed to fetch reject reasons", err);
    } finally {
      isFetching.value = false;
    }

    rejectReasons.value = reasons;
    return reasons;
  }

  async function fetchRejectReasonEnumTypes() {
    if (rejectReasonEnumTypes.value.length) {
      return rejectReasonEnumTypes.value;
    }

    let enumTypes: any[] = [];
    try {
      const params = {
        parentTypeId: ["REPORT_AN_ISSUE", "RPRT_NO_VAR_LOG"],
        parentTypeId_op: "in",
        pageIndex: 0,
        pageSize: 20
      };

      const resp: any = await api({
        url: "/admin/enumTypes",
        method: "GET",
        params: params
      });

      if (!commonUtil.hasError(resp)) {
        enumTypes = resp.data || [];
      } else {
        throw resp.data;
      }
    } catch (err) {
      logger.error("Failed to fetch reject reason enum types", err);
    }

    rejectReasonEnumTypes.value = enumTypes;
    return enumTypes;
  }

  async function fetchEnumGroupMembers(enumerationGroupId: string) {
    let groupMembers: Record<string, any> = {};
    try {
      const payload = {
        enumerationGroupId,
        pageSize: 200,
        orderByField: "sequenceNum"
      };

      const resp: any = await api({
        url: `/admin/enumGroups/${enumerationGroupId}/members`,
        method: "GET",
        params: payload,
      });

      if (!commonUtil.hasError(resp)) {
        const activeReasons = (resp.data || []).filter((reason: any) => !reason.thruDate);
        groupMembers = activeReasons.reduce((rejReasons: Record<string, any>, reason: any) => {
          rejReasons[reason.enumId] = reason;
          return rejReasons;
        }, {});
      } else {
        throw resp.data;
      }
    } catch (err) {
      logger.error(`Failed to fetch enum group members for ${enumerationGroupId}`, err);
    }

    groupRejectReasons.value[enumerationGroupId] = groupMembers;
    return groupMembers;
  }

  async function createEnumeration(payload: any) {
    return await api({
      url: "/admin/enums",
      method: "POST",
      data: payload,
    });
  }

  async function updateEnumeration(payload: any) {
    return await api({
      url: `/admin/enums/${payload.enumId}`,
      method: "PUT",
      data: payload,
    });
  }

  async function updateEnumerationGroupMember(payload: any) {
    return await api({
      url: `/admin/enumGroups/${payload.enumerationGroupId}/members`,
      method: "POST",
      data: payload,
    });
  }

  async function deleteEnumeration(enumId: string) {
    return await api({
      url: `/admin/enums/${enumId}`,
      method: "DELETE",
    });
  }

  const findReasonsDiff = (previousSeq: any, updatedSeq: any) => {
    const diffSeq: any = Object.keys(previousSeq).reduce((diff, key) => {
      if (updatedSeq[key].enumId === previousSeq[key].enumId && updatedSeq[key].sequenceNum === previousSeq[key].sequenceNum) return diff;
      return {
        ...diff,
        [key]: updatedSeq[key]
      };
    }, {});
    return diffSeq;
  };

  const saveReasonsOrder = async () => {
    const diffReasons = filteredReasons.value.filter((reason: any) =>
      rejectReasons.value.some((rejectReason: any) => rejectReason.enumId === reason.enumId && rejectReason.sequenceNum !== reason.sequenceNum)
    );

    const responses = await Promise.allSettled(
      diffReasons.map(async (reason: any) => {
        await updateEnumeration(reason);
      })
    );

    const isFailedToUpdateSomeReason = responses.some((response) => response.status === "rejected");
    if (isFailedToUpdateSomeReason) {
      commonUtil.showToast(translate("Failed to update sequence for some rejection reasons."));
    } else {
      commonUtil.showToast(translate("Sequence for rejection reasons updated successfully."));
      rejectReasons.value = JSON.parse(JSON.stringify(filteredReasons.value));
    }
  };

  const toggleReasonStatusForCurrentSegment = async (reason: any, groupId: string) => {
    if (!groupId) return;

    let resp: any;
    const currentMember = groupRejectReasons.value[groupId]?.[reason.enumId];

    const payload: any = {
      enumerationId: reason.enumId,
      enumerationGroupId: groupId,
      sequenceNum: reason.sequenceNum,
      fromDate: currentMember?.fromDate || DateTime.now().toMillis()
    };

    if (currentMember?.fromDate) {
      payload.thruDate = DateTime.now().toMillis();
    }

    try {
      resp = await updateEnumerationGroupMember(payload);

      if (!commonUtil.hasError(resp)) {
        await fetchEnumGroupMembers(groupId);
      } else {
        throw resp.data;
      }
    } catch (error: any) {
      logger.error(error);
      commonUtil.showToast(translate("Failed to update reason association with group."));
    }
  };

  return {
    rejectReasons,
    rejectReasonEnumTypes,
    filteredReasons,
    groupRejectReasons,
    isFetching,
    fetchRejectReasons,
    fetchRejectReasonEnumTypes,
    fetchEnumGroupMembers,
    createEnumeration,
    updateEnumeration,
    deleteEnumeration,
    updateEnumerationGroupMember,
    findReasonsDiff,
    saveReasonsOrder,
    toggleReasonStatusForCurrentSegment
  };
}
