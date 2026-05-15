"use client";

import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportMenuProps {
  onExportCSV: () => void;
  onExportPDF: () => void;
  disabled?: boolean;
  count?: number;
  label?: string;
}

export function ExportMenu({
  onExportCSV,
  onExportPDF,
  disabled,
  count,
  label = "Export",
}: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Download className="mr-2 h-4 w-4" />
          {label}
          {typeof count === "number" && (
            <span className="ml-1 text-xs text-muted-foreground">({count})</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={onExportCSV}>
          <FileSpreadsheet className="mr-2 h-4 w-4" />
          CSV (Excel)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportPDF}>
          <FileText className="mr-2 h-4 w-4" />
          PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
