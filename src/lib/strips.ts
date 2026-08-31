import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { authMiddleware } from "@/lib/auth/middleware";

const saveInput = z.object({
  layoutId: z.string().min(1).max(8),
  filterId: z.string().min(1).max(24),
  caption: z.string().max(80).optional().default(""),
  compositeJpeg: z.string().min(32).max(3_500_000),
  shotsJpeg: z.array(z.string().min(32).max(1_800_000)).max(8).optional().default([]),
});

export type StripSummary = {
  id: number;
  layoutId: string;
  filterId: string;
  caption: string;
  compositeJpeg: string;
  createdAt: string;
};

export const saveStrip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(saveInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const shotsJson = JSON.stringify(data.shotsJpeg ?? []);
    const rows = await sql<{ id: number }>`
      insert into strips (user_id, layout_id, filter_id, caption, composite_jpeg, shots_jpeg)
      values (
        ${context.userId}, ${data.layoutId}, ${data.filterId},
        ${data.caption ?? ""}, ${data.compositeJpeg}, ${shotsJson}
      )
      returning id
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error("Не удалось сохранить шаблон");
    return { id };
  });

export const listStrips = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      id: number;
      layout_id: string;
      filter_id: string;
      caption: string;
      composite_jpeg: string;
      created_at: string;
    }>`
      select id, layout_id, filter_id, caption, composite_jpeg,
             created_at::text as created_at
      from strips
      where user_id = ${context.userId}
      order by id desc
      limit 40
    `;
    return rows.map(
      (row): StripSummary => ({
        id: row.id,
        layoutId: row.layout_id,
        filterId: row.filter_id,
        caption: row.caption,
        compositeJpeg: row.composite_jpeg,
        createdAt: row.created_at,
      }),
    );
  });

export const deleteStrip = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      delete from strips where id = ${data.id} and user_id = ${context.userId}
    `;
    return { ok: true };
  });
