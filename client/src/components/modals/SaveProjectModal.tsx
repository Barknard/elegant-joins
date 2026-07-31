import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Download } from 'lucide-react';

interface SaveProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string, description?: string) => void;
  onExportTemplate: () => void;
  currentName?: string;
  currentDescription?: string;
  isNewProject: boolean;
}

export function SaveProjectModal({
  isOpen,
  onClose,
  onSave,
  onExportTemplate,
  currentName = '',
  currentDescription = '',
  isNewProject,
}: SaveProjectModalProps) {
  const [name, setName] = useState(currentName);
  const [description, setDescription] = useState(currentDescription);

  useEffect(() => {
    if (isOpen) {
      setName(currentName || `Project ${new Date().toLocaleDateString()}`);
      setDescription(currentDescription);
    }
  }, [isOpen, currentName, currentDescription]);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), description.trim() || undefined);
      onClose();
    }
  };

  const handleExport = () => {
    onExportTemplate();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] bg-white dark:bg-zinc-900">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5 text-primary" />
            {isNewProject ? 'Save Project' : 'Save Project As'}
          </DialogTitle>
          <DialogDescription>
            {isNewProject
              ? 'Give your project a name to save it for later.'
              : 'Save your project with a new name or update the existing one.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Data Project"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
              }}
              data-testid="project-name-input"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="project-description">Description (optional)</Label>
            <Input
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of your project"
              data-testid="project-description-input"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-zinc-200 dark:border-zinc-800">
          <Button
            variant="outline"
            className="gap-2"
            onClick={handleExport}
            data-testid="export-template-button"
          >
            <Download className="w-4 h-4" />
            Export Template
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} data-testid="cancel-save-project">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!name.trim()}
              className="gap-2"
              data-testid="confirm-save-project"
            >
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
