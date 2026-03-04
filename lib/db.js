import { supabase } from "./supabaseClient";

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user || null;
}

export async function getTemplates() {
  return supabase
    .from("daily_templates")
    .select("*")
    .order("created_at", { ascending: true });
}

export async function setDefaultTemplate(templateId) {
  // set all false then one true
  const user = await getUser();
  if (!user) throw new Error("Not logged in");

  await supabase
    .from("daily_templates")
    .update({ is_default: false })
    .eq("user_id", user.id);

  return supabase
    .from("daily_templates")
    .update({ is_default: true })
    .eq("id", templateId)
    .eq("user_id", user.id);
}

export async function getTemplateItems(templateId) {
  return supabase
    .from("daily_template_items")
    .select("id, sort_order, task:tasks(id,title,priority)")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true });
}

export async function updateTemplateOrder(items) {
  // items: [{id, sort_order}]
  return supabase.from("daily_template_items").upsert(items);
}
