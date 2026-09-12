import { onSessionCleared } from "./sessionScope";

interface UserCreationDraft {
  firstName: string;
  lastName: string;
}

// A one-time handoff between routed pages. Never persisted or placed in the URL.
let pendingDraft: UserCreationDraft | undefined;

const clearDraft = () => { pendingDraft = undefined; };
onSessionCleared(clearDraft);

export function useUserCreationDraft() {
  const setFromSearch = (search: string) => {
    const name = search.trim();
    const [firstName = "", ...lastName] = name ? name.split(/\s+/) : [];
    pendingDraft = { firstName, lastName: lastName.join(" ") };
  };

  const consumeDraft = (): UserCreationDraft => {
    const draft = pendingDraft ?? { firstName: "", lastName: "" };
    clearDraft();
    return draft;
  };

  return { setFromSearch, consumeDraft, clearDraft };
}
