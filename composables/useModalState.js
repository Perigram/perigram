export const useSupportDialog = () => {
    return useState("supportDialog", () => false);
};
export const useSupportChatTarget = () => {
    return useState("supportChatTarget", () => null);
};
// The profile settings popup is shell-owned state: the account menu
// renders it, and record surfaces (the directory's self-profile action)
// open the same popup instead of routing to a profile page.
export const useProfileDialog = () => {
    return useState("profileDialog", () => false);
};
