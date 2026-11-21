package com.mayday.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

class QuickDialWidgetProvider : AppWidgetProvider() {

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
            val views = RemoteViews(context.packageName, R.layout.widget_quick_dial)
            val baseReq = appWidgetId * 20

            // Header shortcuts into app
            views.setOnClickPendingIntent(
                R.id.btn_open_app,
                MaydayPrefs.createAppActionPendingIntent(context, MaydayPrefs.ACTION_OPEN_HOME, baseReq + 1)
            )
            views.setOnClickPendingIntent(
                R.id.btn_open_hospitals,
                MaydayPrefs.createAppActionPendingIntent(context, MaydayPrefs.ACTION_OPEN_MEDICAL, baseReq + 2)
            )
            views.setOnClickPendingIntent(
                R.id.btn_open_map,
                MaydayPrefs.createAppActionPendingIntent(context, MaydayPrefs.ACTION_OPEN_MAP, baseReq + 3)
            )

            // Pre-filled dialer tiles (ACTION_DIAL)
            views.setOnClickPendingIntent(
                R.id.btn_dial_fire,
                MaydayPrefs.createDialPendingIntent(context, "101", baseReq + 4)
            )
            views.setOnClickPendingIntent(
                R.id.btn_dial_medical,
                MaydayPrefs.createDialPendingIntent(context, "108", baseReq + 5)
            )

            // State-aware Police tile
            val stateCode = MaydayPrefs.getUserState(context)
            val policeNum = MaydayPrefs.getPoliceNumber(context)
            views.setTextViewText(R.id.txt_police_num, policeNum)
            views.setTextViewText(R.id.txt_police_label, "Police · $stateCode")
            views.setOnClickPendingIntent(
                R.id.btn_dial_police,
                MaydayPrefs.createDialPendingIntent(context, policeNum, baseReq + 6)
            )

            // Personal Emergency Contact tile (pre-filled dialer once saved; opens setup modal if unset)
            val contact = MaydayPrefs.getEmergencyContact(context)
            if (contact != null) {
                views.setTextViewText(R.id.txt_contact_name, contact.name)
                views.setTextViewText(R.id.txt_contact_sub, "Dial")
                views.setOnClickPendingIntent(
                    R.id.btn_dial_contact,
                    MaydayPrefs.createDialPendingIntent(context, contact.phone, baseReq + 7)
                )
            } else {
                views.setTextViewText(R.id.txt_contact_name, "+ Add")
                views.setTextViewText(R.id.txt_contact_sub, "Contact")
                views.setOnClickPendingIntent(
                    R.id.btn_dial_contact,
                    MaydayPrefs.createAppActionPendingIntent(context, MaydayPrefs.ACTION_OPEN_CONTACT, baseReq + 8)
                )
            }

            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
