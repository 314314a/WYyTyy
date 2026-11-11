package com.wyyty.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.widget.Toast;
import com.getcapacitor.BridgeActivity;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    private static final int CREATE_FILE_REQUEST_CODE = 9001;
    private String pendingFileContent = "";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (this.getBridge() != null && this.getBridge().getWebView() != null) {
            WebView webView = this.getBridge().getWebView();
            webView.getSettings().setJavaScriptEnabled(true);
            webView.addJavascriptInterface(new FolderSaverInterface(), "AndroidFolderSaver");
        }
    }

    public class FolderSaverInterface {
        @JavascriptInterface
        public void saveFileToFolder(String filename, String content, String mimeType) {
            pendingFileContent = content != null ? content : "";
            final String safeName = (filename != null && !filename.isEmpty()) ? filename : "WYyTy_backup.json";
            final String safeMime = (mimeType != null && !mimeType.isEmpty()) ? mimeType.split(";")[0] : "*/*";
            runOnUiThread(() -> {
                try {
                    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    intent.addCategory(Intent.CATEGORY_OPENABLE);
                    intent.setType(safeMime);
                    intent.putExtra(Intent.EXTRA_TITLE, safeName);
                    startActivityForResult(intent, CREATE_FILE_REQUEST_CODE);
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "無法開啟系統資料夾選取器: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CREATE_FILE_REQUEST_CODE) {
            if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
                Uri uri = data.getData();
                try {
                    OutputStream os = getContentResolver().openOutputStream(uri, "wt");
                    if (os != null) {
                        os.write(pendingFileContent.getBytes(StandardCharsets.UTF_8));
                        os.flush();
                        os.close();
                        Toast.makeText(this, "✅ 已成功將檔案儲存至所選資料夾！", Toast.LENGTH_LONG).show();
                    }
                } catch (Exception e) {
                    Toast.makeText(this, "❌ 寫入檔案失敗: " + e.getMessage(), Toast.LENGTH_LONG).show();
                }
            }
        }
    }
}
