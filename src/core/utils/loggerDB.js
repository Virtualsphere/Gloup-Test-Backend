import { adminDbController } from "../../core/database/Controller/AdminDbController.js";

export const logErrorToDB = async ({
  module,
  functionName,
  error,
  requestData
}) => {
  try {
    const safeData = { ...requestData };

    if (safeData?.data?.password) {
      delete safeData.data.password;
    }

    await adminDbController.Models.ErrorLogs.create({
      module,
      function_name: functionName,
      error_message: error?.message || "Unknown error",
      stack_trace: error?.stack || null,
      request_data: safeData,
      error_type: error?.name || "GENERAL",
      created_at: new Date()
    });

  } catch (err) {
    console.error("❌ DB logging failed:", err);
  }
};