import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Upload, FileText, Loader2, HelpCircle, ScanBarcode, Sparkles, Link2, Check, ArrowRight, X, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableNodeType, Column } from '@/components/flow/TableNode';
import { motion, AnimatePresence } from 'framer-motion';
import { parseFile, inferColumnTypes, UnsupportedFileError, MAX_ROWS } from '@/lib/parse/tabular';
import type { DataType } from '@shared/schema';

/** A real, parsed file handed up to the canvas. */
export interface ImportedTable {
  file: File;
  type: 'csv' | 'excel';
  columns: Column[];
  rows: Record<string, unknown>[];
  totalRows: number;
  truncated: boolean;
  ignoredSheets: string[];
  warnings: string[];
}

interface FieldMatch {
  newColumnId: string;
  newColumnName: string;
  existingTableId: string;
  existingTableName: string;
  existingColumnId: string;
  existingColumnName: string;
  confidence: 'high' | 'medium';
  reason: string;
}

interface AddSourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddTable: (table: ImportedTable, autoConnect?: FieldMatch[]) => void;
  existingNodes?: TableNodeType[];
}

// Smart scan algorithm to find matching fields
function findFieldMatches(newColumns: Column[], existingNodes: TableNodeType[]): FieldMatch[] {
  const matches: FieldMatch[] = [];
  
  for (const newCol of newColumns) {
    const newName = newCol.name.toLowerCase().replace(/[_\-\s]/g, '');
    
    for (const node of existingNodes) {
      const tableName = node.data.displayLabel || node.data.label;
      
      for (const existingCol of node.data.columns) {
        const existingName = existingCol.name.toLowerCase().replace(/[_\-\s]/g, '');
        const existingDisplayName = existingCol.displayName || existingCol.name;
        
        // Exact match (case-insensitive, ignoring separators)
        if (newName === existingName) {
          matches.push({
            newColumnId: newCol.id,
            newColumnName: newCol.displayName || newCol.name,
            existingTableId: node.id,
            existingTableName: tableName,
            existingColumnId: existingCol.id,
            existingColumnName: existingDisplayName,
            confidence: 'high',
            reason: 'Exact name match'
          });
          continue;
        }
        
        // ID field matching (customer_id matches customers.id or id matches customer_id)
        const isNewIdField = newName.endsWith('id') || newName === 'id';
        const isExistingIdField = existingName.endsWith('id') || existingName === 'id';
        
        if (isNewIdField && isExistingIdField) {
          // Check if they reference the same entity
          const newBase = newName.replace(/id$/, '');
          const existingBase = existingName.replace(/id$/, '');
          const tableBase = tableName.toLowerCase().replace(/[_\-\s]/g, '').replace(/s$/, ''); // Remove trailing 's'
          
          if (newBase === existingBase || 
              newBase === tableBase || 
              existingBase === tableBase ||
              (newBase === '' && existingName === 'id') ||
              (existingBase === '' && newName === 'id')) {
            matches.push({
              newColumnId: newCol.id,
              newColumnName: newCol.displayName || newCol.name,
              existingTableId: node.id,
              existingTableName: tableName,
              existingColumnId: existingCol.id,
              existingColumnName: existingDisplayName,
              confidence: 'medium',
              reason: 'ID field pattern match'
            });
          }
        }
        
        // Key field matching
        if (existingCol.isKey && newCol.type === existingCol.type) {
          const newWords = newCol.name.toLowerCase().split(/[_\-\s]/);
          const existingWords = existingCol.name.toLowerCase().split(/[_\-\s]/);
          const commonWords = newWords.filter(w => existingWords.includes(w) && w.length > 2);
          
          if (commonWords.length > 0 && !matches.find(m => 
            m.newColumnId === newCol.id && m.existingColumnId === existingCol.id
          )) {
            matches.push({
              newColumnId: newCol.id,
              newColumnName: newCol.displayName || newCol.name,
              existingTableId: node.id,
              existingTableName: tableName,
              existingColumnId: existingCol.id,
              existingColumnName: existingDisplayName,
              confidence: 'medium',
              reason: `Key field with similar name`
            });
          }
        }
      }
    }
  }
  
  // Remove duplicates and keep highest confidence
  const uniqueMatches = matches.reduce((acc, match) => {
    const key = `${match.newColumnId}-${match.existingColumnId}`;
    if (!acc[key] || (match.confidence === 'high' && acc[key].confidence !== 'high')) {
      acc[key] = match;
    }
    return acc;
  }, {} as Record<string, FieldMatch>);
  
  return Object.values(uniqueMatches);
}

export function AddSourceModal({ open, onOpenChange, onAddTable, existingNodes = [] }: AddSourceModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'scan'>('upload');
  const [parsedFile, setParsedFile] = useState<ImportedTable | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [matches, setMatches] = useState<FieldMatch[]>([]);
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set());

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  /**
   * Reads and parses the file for real.
   *
   * This used to be a 1500ms `setTimeout` that fabricated the same four columns
   * (id/name/customer_id/created_at) for every file regardless of its contents — so
   * the preview, the smart scan and the resulting table were all fiction. Now the
   * columns, their inferred types and the row data all come from the actual file.
   */
  const handleFile = async (file: File) => {
    setUploading(true);
    setParseError(null);
    try {
      const parsed = await parseFile(file);

      if (parsed.columns.length === 0) {
        setParseError(
          `"${file.name}" has no readable columns. Check that the first row contains column headings.`,
        );
        return;
      }

      const types = inferColumnTypes(parsed.columns, parsed.rows);

      // Column ids must be unique across the whole canvas and stable from here on, so
      // the smart-scan matches can reference them directly. Generating them here (not
      // in Home) removes the old hardcoded col-1..col-4 remapping, which only worked
      // because both sides faked the identical four columns.
      const tableKey =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID().slice(0, 8)
          : Math.random().toString(36).slice(2, 10);

      const columns: Column[] = parsed.columns.map((name, i) => ({
        id: `${tableKey}-${i}`,
        name,
        type: types[name] as DataType,
        // First column is the default key, matching the previous behaviour — the user
        // can change it, and a connection re-keys both sides automatically.
        isKey: i === 0,
      }));

      setParsedFile({
        file,
        type: file.name.toLowerCase().endsWith('.csv') || file.name.toLowerCase().endsWith('.tsv') ? 'csv' : 'excel',
        columns,
        rows: parsed.rows,
        totalRows: parsed.totalRows,
        truncated: parsed.truncated,
        ignoredSheets: parsed.ignoredSheets,
        warnings: parsed.warnings,
      });
      setStep('preview');
    } catch (err) {
      setParseError(
        err instanceof UnsupportedFileError
          ? err.message
          : `Could not read "${file.name}". ${err instanceof Error ? err.message : 'The file may be corrupt.'}`,
      );
    } finally {
      setUploading(false);
    }
  };

  // `findFieldMatches` is a synchronous name comparison over columns already in memory.
  // The old 800ms setTimeout was theatre — it made a instant operation feel like work.
  const handleSmartScan = () => {
    if (!parsedFile) return;

    const foundMatches = findFieldMatches(parsedFile.columns, existingNodes);
    setMatches(foundMatches);
    setSelectedMatches(
      new Set(
        foundMatches
          .filter(m => m.confidence === 'high')
          .map(m => `${m.newColumnId}-${m.existingColumnId}`)
      )
    );
    setStep('scan');
  };

  const toggleMatch = (matchKey: string) => {
    setSelectedMatches(prev => {
      const next = new Set(prev);
      if (next.has(matchKey)) {
        next.delete(matchKey);
      } else {
        next.add(matchKey);
      }
      return next;
    });
  };

  const handleAddWithConnections = () => {
    if (!parsedFile) return;
    const selectedMatchObjects = matches.filter(
      m => selectedMatches.has(`${m.newColumnId}-${m.existingColumnId}`)
    );
    onAddTable(parsedFile, selectedMatchObjects);
    resetAndClose();
  };

  const handleAddWithoutScan = () => {
    if (!parsedFile) return;
    onAddTable(parsedFile);
    resetAndClose();
  };

  const resetAndClose = () => {
    setStep('upload');
    setParsedFile(null);
    setMatches([]);
    setSelectedMatches(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      if (!open) resetAndClose();
      else onOpenChange(open);
    }}>
      <DialogContent className="sm:max-w-[520px] glass-card border-zinc-200 dark:border-zinc-800">
        <AnimatePresence mode="wait">
          {/* STEP 1: Upload */}
          {step === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Add Your Data
                </DialogTitle>
                <DialogDescription>
                  Upload a spreadsheet file to create a new table on your canvas.
                </DialogDescription>
              </DialogHeader>

              {/* Help text */}
              <div className="flex items-start gap-2 p-3 mt-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <HelpCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-700 dark:text-blue-300">
                  <p className="font-medium mb-1">What files can I use?</p>
                  <ul className="space-y-0.5 text-blue-600 dark:text-blue-400">
                    <li>• <strong>CSV files</strong> - Simple text files with data separated by commas</li>
                    <li>• <strong>Excel files</strong> (.xlsx, .xls) - Spreadsheets from Microsoft Excel or Google Sheets</li>
                  </ul>
                </div>
              </div>
              
              <div 
                  className={cn(
                      "mt-4 border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center gap-4 text-center cursor-pointer",
                      dragActive 
                          ? "border-primary bg-primary/5 scale-[1.02]" 
                          : "border-zinc-200 dark:border-zinc-800 hover:border-primary/50 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                  )}
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-upload')?.click()}
              >
                  <input 
                      id="file-upload" 
                      type="file" 
                      className="hidden" 
                      accept=".csv,.tsv,.xlsx,.xls,.xlsm" 
                      onChange={handleChange}
                      data-testid="file-upload-input"
                  />
                  
                  {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                          <Loader2 className="w-10 h-10 text-primary animate-spin" />
                          <p className="text-sm text-zinc-500 font-medium">Reading your file...</p>
                          <p className="text-xs text-zinc-400">Finding column names and data types</p>
                      </div>
                  ) : (
                      <>
                          <div className="w-16 h-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center mb-2">
                              <Upload className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                          </div>
                          <div className="space-y-1">
                              <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                  Click here or drag your file
                              </p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                  We'll automatically detect your columns and data types
                              </p>
                          </div>
                      </>
                  )}
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                  <Button 
                    variant="outline" 
                    className="h-auto py-4 flex flex-col gap-2 hover:border-primary hover:bg-primary/5" 
                    onClick={() => document.getElementById('file-upload')?.click()}
                    data-testid="button-excel-upload"
                  >
                      <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
                      <span className="text-xs font-medium">Excel File</span>
                      <span className="text-[10px] text-zinc-400">.xlsx, .xls</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-auto py-4 flex flex-col gap-2 hover:border-primary hover:bg-primary/5" 
                    onClick={() => document.getElementById('file-upload')?.click()}
                    data-testid="button-csv-upload"
                  >
                      <FileText className="w-6 h-6 text-blue-600" />
                      <span className="text-xs font-medium">CSV File</span>
                      <span className="text-[10px] text-zinc-400">.csv</span>
                  </Button>
              </div>

              {/* A file that can't be read must say so. Previously an unreadable file
                  still produced a confident four-column preview of data that wasn't there. */}
              {parseError && (
                <div
                  className="mt-4 p-3 rounded-lg border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-900/20 flex gap-2"
                  role="alert"
                  data-testid="import-error"
                >
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-900 dark:text-red-100">{parseError}</p>
                </div>
              )}
            </motion.div>
          )}

          {/* STEP 2: Preview with Smart Scan option */}
          {step === 'preview' && parsedFile && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  File Ready
                </DialogTitle>
                <DialogDescription>
                  We found {parsedFile.columns.length} column{parsedFile.columns.length === 1 ? '' : 's'} and{' '}
                  {parsedFile.totalRows.toLocaleString()} row{parsedFile.totalRows === 1 ? '' : 's'} in your file.
                </DialogDescription>
              </DialogHeader>

              {/* File info */}
              <div className="mt-4 p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    {parsedFile.type === 'csv' ? (
                      <FileText className="w-5 h-5 text-blue-600" />
                    ) : (
                      <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                      {parsedFile.file.name}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {parsedFile.columns.length} column{parsedFile.columns.length === 1 ? '' : 's'} ·{' '}
                      {parsedFile.rows.length.toLocaleString()} row{parsedFile.rows.length === 1 ? '' : 's'} imported
                    </p>
                  </div>
                </div>

                {/* Real column names with the type we inferred, so a wrong guess is
                    visible here rather than discovered later in a broken join. */}
                <div className="mt-3 flex flex-wrap gap-1.5" data-testid="preview-columns">
                  {parsedFile.columns.map(col => (
                    <span
                      key={col.id}
                      className="px-2 py-0.5 text-xs bg-white dark:bg-zinc-800 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400"
                      data-testid={`preview-column-${col.name}`}
                    >
                      {col.name}
                      <span className="ml-1.5 opacity-60">{col.type}</span>
                      {col.isKey && <span className="ml-1 text-amber-500">key</span>}
                    </span>
                  ))}
                </div>

                {/* First rows of the actual file — the old preview showed nothing real,
                    so there was no way to notice a mis-parsed delimiter or header row. */}
                {parsedFile.rows.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded border border-zinc-200 dark:border-zinc-700" data-testid="preview-rows">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-100 dark:bg-zinc-800">
                        <tr>
                          {parsedFile.columns.map(col => (
                            <th key={col.id} className="px-2 py-1 text-left font-medium whitespace-nowrap">{col.name}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {parsedFile.rows.slice(0, 3).map((row, i) => (
                          <tr key={i} className="border-t border-zinc-200 dark:border-zinc-700">
                            {parsedFile.columns.map(col => (
                              <td key={col.id} className="px-2 py-1 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                                {row[col.name] === null || row[col.name] === undefined || row[col.name] === ''
                                  ? <span className="italic opacity-50">empty</span>
                                  : String(row[col.name])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Anything the parser had to compromise on is stated plainly. The server
                  used to silently keep only the first 100 rows and ignore extra sheets. */}
              {(parsedFile.truncated || parsedFile.ignoredSheets.length > 0 || parsedFile.warnings.length > 0) && (
                <div
                  className="mt-4 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
                  data-testid="import-warnings"
                  role="status"
                >
                  <div className="flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <ul className="text-xs text-amber-900 dark:text-amber-100 space-y-1">
                      {parsedFile.truncated && (
                        <li>
                          This file has {parsedFile.totalRows.toLocaleString()} rows. The first{' '}
                          {MAX_ROWS.toLocaleString()} were imported — the rest were left out to keep the
                          canvas responsive.
                        </li>
                      )}
                      {parsedFile.ignoredSheets.length > 0 && (
                        <li>
                          Only the first sheet was imported. Not included:{' '}
                          {parsedFile.ignoredSheets.join(', ')}.
                        </li>
                      )}
                      {parsedFile.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {/* Smart Scan Option */}
              {existingNodes.length > 0 && (
                <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center shrink-0">
                      <ScanBarcode className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                        Smart Scan Available
                      </p>
                      <p className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">
                        Find matching fields with your existing {existingNodes.length} table{existingNodes.length > 1 ? 's' : ''} and auto-connect them.
                      </p>
                    </div>
                  </div>
                  <Button
                    onClick={handleSmartScan}
                    className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white"
                    data-testid="button-smart-scan"
                  >
                    <ScanBarcode className="w-4 h-4 mr-2" />
                    Scan for Matches
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setParsedFile(null);
                    setStep('upload');
                  }}
                  className="flex-1"
                  data-testid="button-back"
                >
                  Back
                </Button>
                <Button
                  onClick={handleAddWithoutScan}
                  className="flex-1"
                  data-testid="button-add-table"
                >
                  Add to Canvas
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: Scan Results */}
          {step === 'scan' && parsedFile && (
            <motion.div
              key="scan"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <DialogHeader>
                <DialogTitle className="text-xl font-semibold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-500" />
                  Scan Results
                </DialogTitle>
                <DialogDescription>
                  {matches.length > 0 
                    ? `Found ${matches.length} potential connection${matches.length > 1 ? 's' : ''}.`
                    : 'No matching fields found with existing tables.'}
                </DialogDescription>
              </DialogHeader>

              {/* Match Results */}
              {matches.length > 0 ? (
                <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto">
                  {matches.map((match) => {
                    const matchKey = `${match.newColumnId}-${match.existingColumnId}`;
                    const isSelected = selectedMatches.has(matchKey);
                    
                    return (
                      <div
                        key={matchKey}
                        onClick={() => toggleMatch(matchKey)}
                        className={cn(
                          "p-3 rounded-lg border cursor-pointer transition-all",
                          isSelected
                            ? "bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700"
                            : "bg-zinc-50 dark:bg-zinc-900/50 border-zinc-200 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-700"
                        )}
                        data-testid={`match-${matchKey}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                            isSelected
                              ? "bg-purple-600 border-purple-600"
                              : "border-zinc-300 dark:border-zinc-600"
                          )}>
                            {isSelected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          
                          <div className="flex-1 flex items-center gap-2 text-sm">
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {match.newColumnName}
                            </span>
                            <Link2 className="w-4 h-4 text-purple-500" />
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {match.existingTableName}.
                            </span>
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {match.existingColumnName}
                            </span>
                          </div>

                          <span className={cn(
                            "px-2 py-0.5 text-[10px] font-medium rounded-full",
                            match.confidence === 'high'
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          )}>
                            {match.confidence === 'high' ? 'Exact' : 'Similar'}
                          </span>
                        </div>
                        <p className="mt-1 ml-8 text-xs text-zinc-500 dark:text-zinc-400">
                          {match.reason}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="mt-4 p-6 text-center bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <div className="w-12 h-12 mx-auto rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
                    <X className="w-6 h-6 text-zinc-400" />
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    No matching fields found. You can still add the table and connect fields manually.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setStep('preview')}
                  className="flex-1"
                  data-testid="button-back-scan"
                >
                  Back
                </Button>
                <Button
                  onClick={handleAddWithConnections}
                  className="flex-1 bg-purple-600 hover:bg-purple-700"
                  data-testid="button-add-with-connections"
                >
                  {selectedMatches.size > 0 ? (
                    <>
                      Add & Connect ({selectedMatches.size})
                      <Link2 className="w-4 h-4 ml-2" />
                    </>
                  ) : (
                    <>
                      Add to Canvas
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}

export type { FieldMatch };
