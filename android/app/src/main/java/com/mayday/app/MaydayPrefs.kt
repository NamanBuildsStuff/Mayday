package com.mayday.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri

data class EmergencyContact(
    val name: String,
    val phone: String
)

object MaydayPrefs {
    private const val PREFS_NAME = "mayday_android_prefs"
    private const val KEY_ICE_NAME = "ice_name"
    private const val KEY_ICE_PHONE = "ice_phone"
    private const val KEY_STATE_CODE = "state_code"

    const val EXTRA_WIDGET_ACTION = "com.mayday.app.WIDGET_ACTION"
    const val ACTION_OPEN_HOME = "open_home"
    const val ACTION_OPEN_MAP = "open_map"
    const val ACTION_OPEN_MEDICAL = "open_medical"
    const val ACTION_OPEN_CONTACT = "open_contact"

    private val STATE_POLICE_MAP = mapOf(
        "PB" to "112",
        "CH" to "112",
        "HR" to "112",
        "DL" to "112",
        "HP" to "112",
        "UP" to "112",
        "MH" to "100",
        "RJ" to "100",
        "GJ" to "100",
        "KA" to "112",
        "TN" to "100",
        "WB" to "100",
        "KL" to "112",
        "TS" to "100"
    )

    fun saveEmergencyContact(context: Context, name: String?, phone: String?) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val cleanPhone = phone?.trim().orEmpty()
        if (cleanPhone.isEmpty()) {
            prefs.edit()
                .remove(KEY_ICE_NAME)
                .remove(KEY_ICE_PHONE)
                .apply()
        } else {
            val cleanName = name?.trim().orEmpty().ifEmpty { "Emergency" }
            prefs.edit()
                .putString(KEY_ICE_NAME, cleanName)
                .putString(KEY_ICE_PHONE, cleanPhone)
                .apply()
        }
        refreshAllWidgets(context)
    }

    fun getEmergencyContact(context: Context): EmergencyContact? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val phone = prefs.getString(KEY_ICE_PHONE, null)?.trim().orEmpty()
        if (phone.isEmpty()) return null
        val name = prefs.getString(KEY_ICE_NAME, "Emergency")?.trim().orEmpty().ifEmpty { "Emergency" }
        return EmergencyContact(name = name, phone = phone)
    }

    fun saveUserState(context: Context, stateCode: String?) {
        val code = stateCode?.trim()?.uppercase().orEmpty()
        if (!STATE_POLICE_MAP.containsKey(code)) return
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_STATE_CODE, code).apply()
        refreshAllWidgets(context)
    }

    fun getUserState(context: Context): String {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val saved = prefs.getString(KEY_STATE_CODE, "PB") ?: "PB"
        return if (STATE_POLICE_MAP.containsKey(saved)) saved else "PB"
    }

    fun getPoliceNumber(context: Context): String {
        return STATE_POLICE_MAP[getUserState(context)] ?: "112"
    }

    fun sanitizeDialNumber(phone: String): String {
        val cleaned = phone.replace(Regex("[^0-9+*#]"), "")
        return cleaned.ifEmpty { phone.trim() }
    }

    fun createDialPendingIntent(
        context: Context,
        phoneNumber: String,
        requestCode: Int
    ): PendingIntent {
        val dialUri = Uri.parse("tel:${sanitizeDialNumber(phoneNumber)}")
        val intent = Intent(Intent.ACTION_DIAL, dialUri).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    fun createAppActionPendingIntent(
        context: Context,
        action: String,
        requestCode: Int
    ): PendingIntent {
        val intent = Intent(context, MainActivity::class.java).apply {
            this.action = "com.mayday.app.ACTION_$action"
            putExtra(EXTRA_WIDGET_ACTION, action)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    fun refreshAllWidgets(context: Context) {
        val appWidgetManager = AppWidgetManager.getInstance(context)

        val quickIds = appWidgetManager.getAppWidgetIds(
            ComponentName(context, QuickDialWidgetProvider::class.java)
        )
        for (id in quickIds) {
            QuickDialWidgetProvider.updateWidget(context, appWidgetManager, id)
        }

        val compactIds = appWidgetManager.getAppWidgetIds(
            ComponentName(context, CompactSosWidgetProvider::class.java)
        )
        for (id in compactIds) {
            CompactSosWidgetProvider.updateWidget(context, appWidgetManager, id)
        }
    }
}
