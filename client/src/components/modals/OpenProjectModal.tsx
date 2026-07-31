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
import { ScrollArea } from '@/components/ui/scroll-area';
import { FolderOpen, Trash2, Search, Clock, Database, FileText, Upload, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/local-api';

interface Project {
  id: number;
  name: string;
  description?: string;
  isTemplate?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface OpenProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenProject: (projectId: number) => void;
  onDeleteProject: (projectId: number) => void;
  onImportTemplate: (file: File) => void;
}

export function OpenProjectModal({
  isOpen,
  onClose,
  onOpenProject,
  onDeleteProject,
  onImportTemplate,
}: OpenProjectModalProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchProjects();
    }
  }, [isOpen]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/projects');
      if (response.ok) {
        const data = await response.json();
        setProjects(data);
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (projectId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project?')) {
      onDeleteProject(projectId);
      setProjects(projects.filter(p => p.id !== projectId));
    }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportTemplate(file);
      onClose();
    }
    e.target.value = '';
  };

  const filteredProjects = projects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] p-0 gap-0 bg-white dark:bg-zinc-900">
        <DialogHeader className="p-6 pb-4 border-b border-zinc-200 dark:border-zinc-800">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FolderOpen className="w-5 h-5 text-primary" />
            Open Project
          </DialogTitle>
          <DialogDescription>
            Select a saved project to continue working, or import a template file.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                data-testid="search-projects"
              />
            </div>
            <label>
              <input
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
                data-testid="import-template-input"
              />
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => document.querySelector<HTMLInputElement>('[data-testid="import-template-input"]')?.click()}
                data-testid="import-template-button"
              >
                <Upload className="w-4 h-4" />
                Import
              </Button>
            </label>
          </div>
        </div>

        <ScrollArea className="h-[400px]">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-zinc-500">
              <Database className="w-8 h-8 mb-2 opacity-50" />
              <p className="text-sm">
                {searchQuery ? 'No matching projects found' : 'No saved projects yet'}
              </p>
              <p className="text-xs mt-1">
                {searchQuery ? 'Try a different search' : 'Save your current work to see it here'}
              </p>
            </div>
          ) : (
            <div className="p-2">
              {filteredProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => setSelectedId(project.id)}
                  onDoubleClick={() => {
                    onOpenProject(project.id);
                    onClose();
                  }}
                  className={cn(
                    "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors group",
                    selectedId === project.id
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-transparent"
                  )}
                  data-testid={`project-item-${project.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                      project.isTemplate
                        ? "bg-purple-100 dark:bg-purple-900/30"
                        : "bg-blue-100 dark:bg-blue-900/30"
                    )}>
                      {project.isTemplate ? (
                        <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                      ) : (
                        <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">
                        {project.name}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <Clock className="w-3 h-3" />
                        <span>{formatDate(project.updatedAt)}</span>
                        {project.isTemplate && (
                          <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded text-[10px] font-medium">
                            Template
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-500 h-8 w-8"
                    onClick={(e) => handleDelete(project.id, e)}
                    data-testid={`delete-project-${project.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} data-testid="cancel-open-project">
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (selectedId) {
                onOpenProject(selectedId);
                onClose();
              }
            }}
            disabled={!selectedId}
            className="gap-2"
            data-testid="confirm-open-project"
          >
            <FolderOpen className="w-4 h-4" />
            Open Project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
