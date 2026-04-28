'use client';

import { CalendarClock, Download, Filter, Send, SquarePen } from 'lucide-react';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ActivityProgressCell, GradebookActivity, GradebookStudent } from '@/types/grading';
import { extendDeadline, publishActivityGrades } from '@/services/grading/grading';

interface GradebookToolbarProps {
  activities: GradebookActivity[];
  students: GradebookStudent[];
  selectedCells: ActivityProgressCell[];
  selectedGradeableCount: number;
  notStartedOnly: boolean;
  onToggleNotStarted: () => void;
  onGradeSelected: () => void;
  onExport: () => void;
  onRefresh: () => void;
}

function localDateTimeValue(date = new Date(Date.now() + 24 * 60 * 60 * 1000)) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export default function GradebookToolbar({
  activities,
  students,
  selectedCells,
  selectedGradeableCount,
  notStartedOnly,
  onToggleNotStarted,
  onGradeSelected,
  onExport,
  onRefresh,
}: GradebookToolbarProps) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [extendActivityId, setExtendActivityId] = useState<number | null>(null);
  const [publishActivityId, setPublishActivityId] = useState<number | null>(activities[0]?.id ?? null);
  const [deadlineLocal, setDeadlineLocal] = useState(localDateTimeValue());
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  const studentsById = useMemo(() => new Map(students.map((student) => [student.id, student])), [students]);
  const selectedActivityIds = useMemo(
    () => Array.from(new Set(selectedCells.map((cell) => cell.activity_id))),
    [selectedCells],
  );
  const extendActivities = useMemo(
    () => activities.filter((activity) => selectedActivityIds.includes(activity.id)),
    [activities, selectedActivityIds],
  );
  const extensionTargets = useMemo(() => {
    if (extendActivityId === null) return [];
    return selectedCells
      .filter((cell) => cell.activity_id === extendActivityId)
      .map((cell) => studentsById.get(cell.user_id)?.user_uuid)
      .filter((uuid): uuid is string => Boolean(uuid));
  }, [extendActivityId, selectedCells, studentsById]);

  useEffect(() => {
    if (extendActivityId === null || !selectedActivityIds.includes(extendActivityId)) {
      setExtendActivityId(selectedActivityIds[0] ?? null);
    }
  }, [extendActivityId, selectedActivityIds]);

  useEffect(() => {
    if (publishActivityId === null && activities[0]) setPublishActivityId(activities[0].id);
  }, [activities, publishActivityId]);

  const submitExtension = () => {
    if (extendActivityId === null || extensionTargets.length === 0) return;
    startTransition(async () => {
      try {
        await extendDeadline(extendActivityId, {
          user_uuids: extensionTargets,
          new_due_at: new Date(deadlineLocal).toISOString(),
          reason,
        });
        toast.success('Deadline extension queued');
        setExtendOpen(false);
        onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to extend deadline');
      }
    });
  };

  const publishGrades = () => {
    if (publishActivityId === null) return;
    startTransition(async () => {
      try {
        const result = await publishActivityGrades(publishActivityId);
        toast.success(`Published ${result.published_count} grades`);
        setPublishOpen(false);
        onRefresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to publish grades');
      }
    });
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={onToggleNotStarted}
      >
        <Filter className="size-4" />
        {notStartedOnly ? 'All states' : 'Not started'}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={selectedGradeableCount === 0}
        onClick={onGradeSelected}
      >
        <SquarePen className="size-4" />
        Grade selected
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={selectedCells.length === 0}
        onClick={() => setExtendOpen(true)}
      >
        <CalendarClock className="size-4" />
        Extend deadline
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={activities.length === 0}
        onClick={() => setPublishOpen(true)}
      >
        <Send className="size-4" />
        Release all grades
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
      >
        <Download className="size-4" />
        Export
      </Button>

      <Dialog
        open={extendOpen}
        onOpenChange={setExtendOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend deadline</DialogTitle>
            <DialogDescription>Apply a per-student deadline override for selected learners.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <NativeSelect
              value={extendActivityId === null ? '' : String(extendActivityId)}
              onChange={(event) => setExtendActivityId(Number(event.target.value))}
              aria-label="Activity"
            >
              {extendActivities.map((activity) => (
                <NativeSelectOption
                  key={activity.id}
                  value={String(activity.id)}
                >
                  {activity.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              type="datetime-local"
              value={deadlineLocal}
              onChange={(event) => setDeadlineLocal(event.target.value)}
              aria-label="New deadline"
            />
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason"
            />
            <div className="text-muted-foreground text-xs">
              {extensionTargets.length} selected learners will be updated.
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              disabled={isPending || extensionTargets.length === 0}
              onClick={submitExtension}
            >
              Apply extension
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release all grades</DialogTitle>
            <DialogDescription>Publish every draft grade for the selected activity to students.</DialogDescription>
          </DialogHeader>
          <NativeSelect
            value={publishActivityId === null ? '' : String(publishActivityId)}
            onChange={(event) => setPublishActivityId(Number(event.target.value))}
            aria-label="Activity"
          >
            {activities.map((activity) => (
              <NativeSelectOption
                key={activity.id}
                value={String(activity.id)}
              >
                {activity.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              disabled={isPending || publishActivityId === null}
              onClick={publishGrades}
            >
              Release grades
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
