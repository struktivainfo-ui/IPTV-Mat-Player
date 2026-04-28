package app.vercel.iptvmatplayer;

import android.net.Uri;
import android.os.Bundle;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.hls.HlsMediaSource;
import androidx.media3.exoplayer.source.MediaSource;
import androidx.media3.exoplayer.source.ProgressiveMediaSource;
import androidx.media3.extractor.DefaultExtractorsFactory;
import androidx.media3.ui.PlayerView;

@UnstableApi
public class NativePlayerActivity extends AppCompatActivity {
    private static final String USER_AGENT =
        "IPTV-Mat-Player/Native Android Media3";

    private ExoPlayer player;
    private PlayerView playerView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_native_player);

        playerView = findViewById(R.id.native_player_view);
        TextView titleView = findViewById(R.id.native_player_title);
        TextView subtitleView = findViewById(R.id.native_player_subtitle);

        String url = getIntent().getStringExtra("url");
        String title = getIntent().getStringExtra("title");
        String subtitle = getIntent().getStringExtra("subtitle");
        String format = getIntent().getStringExtra("format");
        boolean isLive = getIntent().getBooleanExtra("isLive", true);

        titleView.setText(title == null || title.isEmpty() ? "IPTV Stream" : title);
        subtitleView.setText(subtitle == null ? "" : subtitle);

        DefaultHttpDataSource.Factory httpFactory = new DefaultHttpDataSource.Factory()
            .setUserAgent(USER_AGENT)
            .setAllowCrossProtocolRedirects(true)
            .setConnectTimeoutMs(15000)
            .setReadTimeoutMs(30000);

        player = new ExoPlayer.Builder(this).build();
        playerView.setPlayer(player);

        if (url != null && !url.trim().isEmpty()) {
            MediaItem mediaItem = new MediaItem.Builder()
                .setUri(Uri.parse(url))
                .build();

            MediaSource mediaSource;
            String safeFormat = format == null ? "" : format.toLowerCase();

            if ("hls".equals(safeFormat) || url.toLowerCase().contains(".m3u8")) {
                mediaSource = new HlsMediaSource.Factory(httpFactory).createMediaSource(mediaItem);
            } else if ("ts".equals(safeFormat) || url.toLowerCase().contains(".ts")) {
                DefaultExtractorsFactory extractorsFactory = new DefaultExtractorsFactory();
                mediaSource = new ProgressiveMediaSource.Factory(httpFactory, extractorsFactory)
                    .createMediaSource(mediaItem);
            } else {
                mediaSource = new ProgressiveMediaSource.Factory(httpFactory, new DefaultExtractorsFactory())
                    .createMediaSource(mediaItem);
            }

            player.setMediaSource(mediaSource);
            player.setPlayWhenReady(true);
            player.prepare();
        }
    }

    @Override
    protected void onDestroy() {
        if (player != null) {
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}
