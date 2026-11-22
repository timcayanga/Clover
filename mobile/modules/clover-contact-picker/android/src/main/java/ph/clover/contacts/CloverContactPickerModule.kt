package ph.clover.contacts

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.ContactsContract
import android.provider.ContactsContract.CommonDataKinds.Email
import android.provider.ContactsContract.CommonDataKinds.Phone
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.Serializable

private data class PickInput(val mime: String? = null) : Serializable
private class PickContract : AppContextActivityResultContract<PickInput, Uri?> {
  override fun createIntent(context: Context, input: PickInput) =
    if (input.mime == null) Intent(Intent.ACTION_PICK, ContactsContract.Contacts.CONTENT_URI)
    else Intent(Intent.ACTION_PICK).setType(input.mime)
  override fun parseResult(input: PickInput, resultCode: Int, intent: Intent?) =
    if (resultCode == Activity.RESULT_OK) intent?.data else null
}

class CloverContactPickerModule : Module() {
  private lateinit var picker: AppContextActivityResultLauncher<PickInput, Uri?>
  override fun definition() = ModuleDefinition {
    Name("CloverContactPicker")
    RegisterActivityContracts { picker = registerForActivityResult(PickContract()) }
    AsyncFunction("pick") Coroutine { ->
      val uri = picker.launch(PickInput()) ?: return@Coroutine null
      val resolver = requireNotNull(appContext.reactContext).contentResolver
      val result = mutableMapOf<String, String>()
      resolver.query(uri, arrayOf(ContactsContract.Contacts.DISPLAY_NAME, ContactsContract.Contacts._ID), null, null, null)?.use {
        if (it.moveToFirst()) {
          result["name"] = it.getString(0).orEmpty()
          result["contactId"] = it.getString(1)
        }
      }
      // Some providers grant only the selected display name.
      try {
        val data = Uri.withAppendedPath(uri, ContactsContract.Contacts.Data.CONTENT_DIRECTORY)
        val columns = arrayOf(ContactsContract.Data.MIMETYPE, ContactsContract.Data.DATA1)
        resolver.query(data, columns, null, null, null)?.use { rows ->
          while (rows.moveToNext()) {
            val field = when (rows.getString(0)) {
              Phone.CONTENT_ITEM_TYPE -> "phone"
              Email.CONTENT_ITEM_TYPE -> "email"
              else -> continue
            }
            rows.getString(1)?.let { result.putIfAbsent(field, it) }
          }
        }
      } catch (_: SecurityException) { /* Keep the selected name. */ }
      result
    }
    // A picker can grant access to a contact but not its child data URI.
    // A typed pick grants read access to precisely the selected data row.
    AsyncFunction("pickDetail") Coroutine { contactId: String, field: String ->
      val mime = when (field) {
        "email" -> Email.CONTENT_TYPE
        "phone" -> Phone.CONTENT_TYPE
        else -> error("Unknown contact field")
      }
      val uri = picker.launch(PickInput(mime)) ?: return@Coroutine null
      val resolver = requireNotNull(appContext.reactContext).contentResolver
      resolver.query(uri, arrayOf(ContactsContract.Data.CONTACT_ID, ContactsContract.Data.DATA1),
        null, null, null)?.use { rows ->
        check(rows.moveToFirst() && rows.getString(0) == contactId) { "Different contact selected" }
        rows.getString(1)
      }
    }
  }
}
