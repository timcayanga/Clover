package __CLOVER_PACKAGE__;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public final class CloverQuickActionsProvider extends AppWidgetProvider {
  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
    for (int id : ids) {
      RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.clover_quick_actions);
      bind(context, views, R.id.clover_expense, "expense");
      bind(context, views, R.id.clover_receipt, "receipt");
      bind(context, views, R.id.clover_transactions, "transactions");
      bind(context, views, R.id.clover_ask, "ask");
      bind(context, views, R.id.clover_accounts, "accounts");
      manager.updateAppWidget(id, views);
    }
  }

  private void bind(Context context, RemoteViews views, int view, String action) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("__CLOVER_SCHEME__://launcher/" + action));
    intent.setClass(context, MainActivity.class);
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    views.setOnClickPendingIntent(view, PendingIntent.getActivity(
      context, 0, intent, PendingIntent.FLAG_IMMUTABLE
    ));
  }
}
