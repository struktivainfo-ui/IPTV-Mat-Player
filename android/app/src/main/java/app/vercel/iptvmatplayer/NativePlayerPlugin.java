package app.vercel.iptvmatplayer;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");

        if (url == null || url.trim().isEmpty()) {
            call.reject("Stream-URL fehlt.");
            return;
        }

        Intent intent = new Intent(getContext(), NativePlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("title", call.getString("title", "IPTV Stream"));
        intent.putExtra("subtitle", call.getString("subtitle", ""));
        intent.putExtra("format", call.getString("format", ""));
        intent.putExtra("isLive", call.getBoolean("isLive", true));
        intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        getActivity().startActivity(intent);

        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }
}
