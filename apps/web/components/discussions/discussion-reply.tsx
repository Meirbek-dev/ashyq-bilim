'use client';

import { ArrowBigDown, ArrowBigUp, Clock, Edit, Trash2 } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import { Actions, Resources, Scopes } from '@/types/permissions';
import RichContentRenderer from './rich-content-renderer';
import UserAvatar from '@components/Objects/UserAvatar';
import { usePermissions } from '@/components/Security';
import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { Badge } from '@/components/ui/badge';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';

const RichTextEditor = dynamic(() => import('./rich-text-editor'), {
  ssr: false,
  loading: () => <div className="h-[80px] w-full animate-pulse rounded-lg border bg-muted/40" />,
});

interface DiscussionReplyProps {
  reply: any;
  postId: string;
  currentUser: any;
  onVoteReply: (postId: string, replyId: string, voteType: 'up' | 'down') => void;
  onDeleteReply: (postId: string, replyId: string) => void;
  onEditReply: (postId: string, replyId: string, newMessage: string) => void;
}

export default function DiscussionReply({
  reply,
  postId,
  currentUser,
  onVoteReply,
  onDeleteReply,
  onEditReply,
}: DiscussionReplyProps) {
  const t = useTranslations('CoursePage');
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState(reply.replyMessage);
  const [_isPending, startTransition] = useTransition();
  const format = useFormatter();
  const now = useNow();
  const org = usePlatform();
  const { can } = usePermissions();
  const canModerateDiscussion = can(Actions.MODERATE, Resources.DISCUSSION, Scopes.ORG);

  const isOwnReply = reply.username === currentUser?.username;
  const netScore = reply.upvotes - reply.downvotes;

  const getUserDisplayName = (firstName?: string, lastName?: string) => {
    const first = firstName || '';
    const last = lastName || '';
    return `${first} ${last}`.trim() || reply.username;
  };

  const hasMeaningfulText = (value: string) => {
    // Check if content has meaningful text (not just empty HTML tags)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = value;
    const textContent = tempDiv.textContent || tempDiv.textContent || '';

    return textContent.trim().length > 0;
  };

  const handleEditSubmit = (formData: FormData) => {
    const nextEditContent = String(formData.get('editContent') ?? '');

    if (!hasMeaningfulText(nextEditContent)) return;
    startTransition(() => {
      onEditReply(postId, reply.id, nextEditContent);
      setEditing(false);
    });
  };

  // Helper to check if a given user is admin for the org
  const isAuthorAdmin = (username: string) => {
    if (!reply?.username) return false;
    // If current user is admin and is the author, show badge
    return canModerateDiscussion && username === currentUser?.username;
  };

  return (
    <div className="group relative ml-6 border-l-2 border-slate-200 py-4 pl-6 transition-colors hover:border-slate-300">
      {/* Connection line dot */}
      <div className="absolute top-6 left-[-5px] h-2 w-2 rounded-full bg-slate-300 transition-colors group-hover:bg-slate-400" />

      <div className="flex gap-3">
        <UserAvatar
          size="sm"
          variant="default"
          username={reply.username}
          className="shrink-0"
        />

        <div className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-slate-900">
                {getUserDisplayName(reply.firstName, reply.lastName)}
              </span>
              <span className="truncate text-sm text-slate-500">@{reply.username}</span>
              {isAuthorAdmin(reply.username) && (
                <Badge
                  variant="destructive"
                  className="h-auto px-1.5 py-0.5 text-xs"
                >
                  {t('admin')}
                </Badge>
              )}
              <div className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
                <Clock size={12} />
                <span>{format.relativeTime(new Date(reply.createDate), now)}</span>
                {reply.updateDate &&
                  reply.createDate &&
                  new Date(reply.updateDate).getTime() !== new Date(reply.createDate).getTime() && (
                    <span className="text-xs text-slate-400">({t('edited')})</span>
                  )}
              </div>
            </div>

            {/* Action buttons */}
            {(canModerateDiscussion || isOwnReply) && !editing && (
              <div className="mr-5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                {isOwnReply && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(true);
                      setEditContent(reply.replyMessage);
                    }}
                    className="h-7 w-7 p-0 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                  >
                    <Edit size={12} />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDeleteReply(postId, reply.id)}
                  className="h-7 w-7 p-0 text-slate-500 hover:bg-red-50 hover:text-red-600"
                >
                  <Trash2 size={12} />
                </Button>
              </div>
            )}
          </div>

          {/* Content */}
          {editing ? (
            <form
              action={handleEditSubmit}
              className="space-y-3"
            >
              <input
                type="hidden"
                name="editContent"
                value={editContent}
              />
              <RichTextEditor
                content={editContent}
                onChange={setEditContent}
                placeholder={t('editReplyPlaceholder')}
                minHeight="80px"
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(false)}
                  className="h-8 px-3 text-sm"
                >
                  {t('cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!hasMeaningfulText(editContent)}
                  className="h-8 px-3 text-sm"
                >
                  {t('save')}
                </Button>
              </div>
            </form>
          ) : (
            <>
              <div className="mb-3">
                <RichContentRenderer
                  content={reply.replyMessage}
                  className="text-sm leading-relaxed text-slate-700"
                />
              </div>

              {/* Voting section */}
              <div className="flex items-center gap-3">
                <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onVoteReply(postId, reply.id, 'up')}
                    className={cn(
                      'h-8 rounded-none border-slate-200 border-r px-3 transition-all',
                      reply.userVote === 'up'
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-green-600',
                    )}
                  >
                    <ArrowBigUp
                      size={14}
                      className="mr-1"
                    />
                    <span className="text-sm font-medium">{reply.upvotes}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onVoteReply(postId, reply.id, 'down')}
                    className={cn(
                      'h-8 rounded-none px-3 transition-all',
                      reply.userVote === 'down'
                        ? 'bg-red-50 text-red-700 hover:bg-red-100'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-red-600',
                    )}
                  >
                    <ArrowBigDown
                      size={14}
                      className="mr-1"
                    />
                    <span className="text-sm font-medium">{reply.downvotes}</span>
                  </Button>
                </div>

                {/* Net score indicator */}
                {Math.abs(netScore) > 0 && (
                  <div className="flex items-center">
                    <div
                      className={cn(
                        'rounded-full px-2 py-1 font-medium text-xs',
                        netScore > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700',
                      )}
                    >
                      {netScore > 0 ? '+' : ''}
                      {netScore}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
