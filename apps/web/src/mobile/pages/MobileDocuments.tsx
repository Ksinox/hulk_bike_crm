import { FileSignature, FileText, Tags, Monitor } from "lucide-react";
import { useApiDocumentTemplates } from "@/lib/api/document-templates";

/**
 * Мобильные «Документы» — read-режим. Редактор шаблонов и прейскурант —
 * полноценные десктоп-инструменты (WYSIWYG, drag-and-drop переменных,
 * таблицы цен), на телефоне показываем обзор и список доступных шаблонов.
 */
export function MobileDocuments() {
  const { data: templates = [], isLoading } = useApiDocumentTemplates();

  return (
    <div className="flex flex-col gap-4">
      {/* Что есть в разделе */}
      <div className="flex flex-col gap-2">
        <InfoCard
          icon={<FileSignature size={18} />}
          title="Шаблоны документов"
          text="Договор, акты приёма-передачи и повреждений. Генерируются по данным аренды."
        />
        <InfoCard
          icon={<Tags size={18} />}
          title="Прейскурант"
          text="Справочник цен: детали, штрафы, повреждения, экипировка."
        />
      </div>

      {/* Кастомные шаблоны (если заданы) */}
      <div>
        <div className="mb-2 px-1 text-[13px] font-bold text-muted">
          Изменённые шаблоны
        </div>
        {isLoading ? (
          <div className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-2 shadow-card-sm">
            Загрузка…
          </div>
        ) : templates.length === 0 ? (
          <div className="rounded-2xl bg-surface p-4 text-center text-[13px] text-muted-2 shadow-card-sm">
            Все шаблоны стандартные — изменений нет
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-card-sm"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <FileText size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-bold text-ink">{t.name}</div>
                  <div className="truncate text-[11px] text-muted">
                    {t.kind === "custom" ? "Свой шаблон" : "Изменённый системный"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5 rounded-2xl bg-surface-soft p-3.5 text-[12px] text-muted">
        <Monitor size={18} className="shrink-0 text-muted-2" />
        Редактирование шаблонов, печать договоров и прейскурант доступны на
        компьютере.
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-surface p-3.5 shadow-card-sm">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-soft text-muted">
        {icon}
      </span>
      <div>
        <div className="text-[14px] font-bold text-ink">{title}</div>
        <div className="mt-0.5 text-[12px] leading-relaxed text-muted">{text}</div>
      </div>
    </div>
  );
}
