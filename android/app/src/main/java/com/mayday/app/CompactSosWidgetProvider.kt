package com.mayday.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class CompactSosWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    companion object {
        fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val views = RemoteViews(context.packageName, R.layout.widget_compact_sos)
            val baseReq = 10000 + appWidgetId * 10

            // 112 Pre-filled dialer
            views.setOnClickPendingIntent(
                R.id.btn_compact_112,
                MaydayPrefs.createDialPendingIntent(context, "112", baseReq + 1)
            )

            // Personal Emergency Contact (pre-filled dialer if saved, else open Save Contact modal)
            val contact = MaydayPrefs.getEmergencyContact(context)
            if (contact != null) {
                views.setTextViewText(R.id.txt_compact_contact, contact.name)
                views.setOnClickPendingIntent(
                    R.id.btn_compact_contact,
                    MaydayPrefs.createDialPendingIntent(context, contact.phone, baseReq + 2)
                )
            } else {
                views.setTextViewText(R.id.txt_compact_contact, "+ Contact")
                views.setOnClickPendingIntent(
                    R.id.btn_compact_contact,
                    MaydayPrefs.createAppActionPendingIntent(context, MaydayPrefs.ACTION_OPEN_CONTACT, baseReq + 3)
                )
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
