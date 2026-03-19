'use client';

import { ArrowBigDown, ArrowBigUp, Clock, Edit, Reply, Send, Trash2 } from 'lucide-react';
import { PermissionTooltip } from '@/components/Utils/PermissionTooltip';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { usePlatform } from '@/components/Contexts/PlatformContext';
import RichContentRenderer from './rich-content-renderer';
import UserAvatar from '@components/Objects/UserAvatar';
import { Separator } from '@/components/ui/separator';
import DiscussionReply from './discussion-reply';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import dynamic from 'next/dynamic';
import { cn } from '@/lib/utils';
import { useState } from 'react';

const RichTextEditor = dynamic(() => import('./rich-text-editor'), {
  ssr: false,
  loading: () => <div className="h-[120px] w-full animate-pulse rounded-lg border bg-muted/40" />,
});

interface DiscussionPostData {
  id: string;
  postMessage: string;
  username: string;
  firstName?: string;
  lastName?: string;
  createDate: string;
  updateDate?: string;
  upvotes: number;
  downvotes: number;
  userVote?: 'up' | 'down';
  replies?: any[];
  can_update?: boolean;
  can_delete?: boolean;
  can_moderate?: boolean;
  is_owner?: boolean;
  is_creator?: boolean;
  available_actions?: string[];
}

interface DiscussionPostProps {
  post: DiscussionPostData;
  currentUser: any;
  onVotePost: (postId: string, voteType: 'up' | 'down') => void;
  onVoteReply: (postId: string, replyId: string, voteType: 'up' | 'down') => void;
  onDeletePost: (postId: string) => void;
  onDeleteReply: (postId: string, replyId: string) => void;
  onEditPost: (postId: string, newMessage: string) => void;
  onEditReply: (postId: string, replyId: string, newMessage: string) => void;
  onSubmitReply: (postId: string, replyText: string) => void;
}

export default function DiscussionPost({
  post,
  currentUser,
  onVotePost,
  onVoteReply,
  onDeletePost,
  onDeleteReply,
  onEditPost,
  onEditReply,
  onSubmitReply,
}: DiscussionPostProps) {
  const t = useTranslations('CoursePage');
  const [replyingTo, setReplyingTo] = useState<boolean>(false);
  const [replyContent, setReplyContent] = useState('');
  const [editingPost, setEditingPost] = useState(false);
  const [editContent, setEditContent] = useState(post.postMessage);
  const format = useFormatter();
  const now = useNow();
  const org = usePlatform();

  // Use backend permission metadata
  const canUpdate = post.can_update ?? false;
  const canDelete = post.can_delete ?? false;
  const canModerate = post.can_moderate ?? false;
  const isOwner = post.is_owner ?? false;

  const netScore = post.upvotes - post.downvotes;

  const getUserDisplayName = (firstName?: string, lastName?: string) => {
    const first = firstName || '';
    const last = lastName || '';
    return `${first} ${last}`.trim() || post.username;
  };

  const hasMeaningfulText = (value: string) => {
    // Check if content has meaningful text (not just empty HTML tags)
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = value;
    const textContent = tempDiv.textContent || tempDiv.textContent || '';

    return textContent.trim().length > 0;
  };

  const handleSubmitReply = (formData: FormData) => {
    const nextReplyContent = String(formData.get('replyContent') ?? '');

    if (!hasMeaningfulText(nextReplyContent)) return;
    onSubmitReply(post.id, nextReplyContent);
    setReplyContent('');
    setReplyingTo(false);
  };

  const handleEditSubmit = (formData: FormData) => {
    const nextEditContent = String(formData.get('editContent') ?? '');

    if (!hasMeaningfulText(nextEditContent)) return;
    onEditPost(post.id, nextEditContent);
    setEditingPost(false);
  };

  return (
    <div className="group bg-card text-card-foreground overflow-hidden rounded-lg border shadow-sm">
      <div className="p-5">
        <div className="flex items-start gap-4">
          <UserAvatar
            size="md"
            variant="default"
            username={post.username}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="font-semibold text-slate-900">{getUserDisplayName(post.firstName, post.lastName)}</h4>
                <span className="text-sm text-slate-500">@{post.username}</span>
                {canModerate && (
                  <Badge
                    variant="destructive"
                    className="h-auto px-1.5 py-0.5 text-xs"
                  >
                    {t('moderator')}
                  </Badge>
                )}
                {isOwner && (
                  <Badge
                    variant="secondary"
                    className="h-auto px-1.5 py-0.5 text-xs"
                  >
                    {t('author')}
                  </Badge>
                )}
                <div className="flex items-center gap-1 text-xs text-slate-400">
                  <Clock size={12} />
                  <span>{format.relativeTime(new Date(post.createDate), now)}</span>
                  {post.updateDate &&
                    post.createDate &&
                    new Date(post.updateDate).getTime() !== new Date(post.createDate).getTime() && (
                      <span className="text-xs text-slate-400">({t('edited')})</span>
                    )}
                </div>
              </div>
              {(canDelete || canUpdate) && !editingPost && (
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <PermissionTooltip
                    enabled={canUpdate}
                    action="update"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingPost(true);
                        setEditContent(post.postMessage);
                      }}
                      disabled={!canUpdate}
                      className="h-7 w-7 p-0 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                    >
                      <Edit size={12} />
                    </Button>
                  </PermissionTooltip>
                  <PermissionTooltip
                    enabled={canDelete}
                    action="delete"
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeletePost(post.id)}
                      disabled={!canDelete}
                      className="h-7 w-7 p-0 text-slate-500 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={12} />
                    </Button>
                  </PermissionTooltip>
                </div>
              )}
            </div>

            {editingPost ? (
              <form
                action={handleEditSubmit}
                className="mt-3"
              >
                <input
                  type="hidden"
                  name="editContent"
                  value={editContent}
                />
                <RichTextEditor
                  content={editContent}
                  onChange={setEditContent}
                  placeholder={t('editPostPlaceholder')}
                  minHeight="120px"
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingPost(false);
                    }}
                  >
                    {t('cancel')}
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!hasMeaningfulText(editContent)}
                  >
                    {t('save')}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-3">
                <RichContentRenderer content={post.postMessage} />
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onVotePost(post.id, 'up')}
                    className={cn(
                      'h-8 rounded-none border-slate-200 border-r px-3 transition-all',
                      post.userVote === 'up'
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-green-600',
                    )}
                  >
                    <ArrowBigUp
                      size={16}
                      className="mr-1"
                    />
                    <span className="text-sm font-medium">{post.upvotes}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onVotePost(post.id, 'down')}
                    className={cn(
                      'h-8 rounded-none px-3 transition-all',
                      post.userVote === 'down'
                        ? 'bg-red-50 text-red-700 hover:bg-red-100'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-red-600',
                    )}
                  >
                    <ArrowBigDown
                      size={16}
                      className="mr-1"
                    />
                    <span className="text-sm font-medium">{post.downvotes}</span>
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

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReplyingTo(!replyingTo)}
                className={cn(
                  'h-8 rounded-full px-3 text-slate-600 transition-all',
                  replyingTo && 'bg-blue-50 text-blue-700',
                )}
              >
                <Reply
                  size={16}
                  className="mr-1"
                />
                <span>{t('reply')}</span>
                {post.replies && post.replies.length > 0 && (
                  <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium">
                    {post.replies.length}
                  </span>
                )}
              </Button>
            </div>

            {replyingTo ? (
              <form
                action={handleSubmitReply}
                className="mt-4"
              >
                <input
                  type="hidden"
                  name="replyContent"
                  value={replyContent}
                />
                <div className="flex items-start gap-3">
                  <UserAvatar
                    size="xs"
                    variant="default"
                    username={currentUser?.username}
                  />
                  <div className="flex-1">
                    <RichTextEditor
                      content={replyContent}
                      onChange={setReplyContent}
                      placeholder={t('writeReplyPlaceholder')}
                      minHeight="100px"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setReplyingTo(false);
                          setReplyContent('');
                        }}
                      >
                        {t('cancel')}
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={!hasMeaningfulText(replyContent)}
                        className="flex items-center gap-1"
                      >
                        <Send size={14} />
                        <span>{t('reply')}</span>
                      </Button>
                    </div>
                  </div>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      </div>

      {/* Replies */}
      {post.replies && post.replies.length > 0 ? (
        <>
          <Separator />
          <div className="bg-slate-50/80 py-1">
            {post.replies.map((reply: any) => (
              <DiscussionReply
                key={reply.id}
                reply={reply}
                postId={post.id}
                currentUser={currentUser}
                onVoteReply={onVoteReply}
                onDeleteReply={onDeleteReply}
                onEditReply={onEditReply}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
