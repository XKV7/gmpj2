import { useUI } from '../store/ui';
import { ConfirmModal, CropModal, PromptModal } from './CommonModals';
import { CreateChannelModal, CreateServerModal, EditChannelModal, InviteModal, JoinInviteModal, RestrictMemberModal, ServerSettingsModal } from './ServerModals';
import { AddFriendModal, CreateCategoryModal, InviteToGroupModal, NewChatModal, ProfileModal, SettingsModal } from './UserModals';

export function ModalHost() {
  const modals = useUI((s) => s.modals);
  return (
    <>
      {modals.map((m, i) => {
        const key = `${i}-${m.type}`;
        switch (m.type) {
          case 'createServer': return <CreateServerModal key={key} />;
          case 'joinInvite': return <JoinInviteModal key={key} code={m.code} />;
          case 'invite': return <InviteModal key={key} serverId={m.serverId} />;
          case 'serverSettings': return <ServerSettingsModal key={key} serverId={m.serverId} tab={m.tab} />;
          case 'createChannel': return <CreateChannelModal key={key} spec={m} />;
          case 'editChannel': return <EditChannelModal key={key} channelId={m.channelId} />;
          case 'createCategory': return <CreateCategoryModal key={key} serverId={m.serverId} />;
          case 'newChat': return <NewChatModal key={key} />;
          case 'inviteToGroup': return <InviteToGroupModal key={key} conversationId={m.conversationId} />;
          case 'profile': return <ProfileModal key={key} userId={m.userId} />;
          case 'settings': return <SettingsModal key={key} tab={m.tab} />;
          case 'confirm': return <ConfirmModal key={key} spec={m} />;
          case 'prompt': return <PromptModal key={key} spec={m} />;
          case 'cropImage': return <CropModal key={key} spec={m} />;
          case 'addFriend': return <AddFriendModal key={key} />;
          case 'restrictMember': return <RestrictMemberModal key={key} serverId={m.serverId} userId={m.userId} />;
          default: return null;
        }
      })}
    </>
  );
}
