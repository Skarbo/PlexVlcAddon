var plexVlc = {
    contextMenuItem: null,
    plexPort: null,
    vlcLocation: null,
    vlcFile: null,
    vlcProcess: null,
    plexDetailsUrlRegex: /\/details\/(\d+)/,
    toastElement: null,
    toastTimeout: null,

    init: function () {
        console.log( "Init" );
        var menuId = "plexvlc-add",
            contextMenu = document.getElementById( "contentAreaContextMenu" );

        plexVlc.preferences = Components.classes["@mozilla.org/preferences-service;1"]
            .getService( Components.interfaces.nsIPrefService )
            .getBranch( "extensions.plexvlc." );
        plexVlc.plexPort = plexVlc.preferences.getCharPref( "plex_port" );
        plexVlc.vlcLocation = plexVlc.preferences.getCharPref( "vlc_location" ); // "/Applications/VLC.app/Contents/MacOS/VLC" //  "C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe";

        plexVlc.contextMenuItem = document.getElementById( menuId );
        plexVlc.vlcFile = Components.classes["@mozilla.org/file/local;1"]
            .createInstance( Components.interfaces.nsILocalFile );
        plexVlc.videoFile = Components.classes["@mozilla.org/file/local;1"]
            .createInstance( Components.interfaces.nsILocalFile );

        if ( contextMenu ) {
            contextMenu.addEventListener( "popupshowing", plexVlc.onPopupshowing, false );
        }
    },
    onPopupshowing: function () {
        var target = gContextMenu ? gContextMenu.target : null,
            isPortPlex = content.location.port === plexVlc.plexPort,
            isUrlPlexDetails = plexVlc.plexDetailsUrlRegex.test( content.location.href ),
            hasTargetPlexAnchorDetails = plexVlc.isPlexDetailsAnchor( target );

        plexVlc.contextMenuItem.setAttribute( "hidden", isPortPlex && (isUrlPlexDetails || hasTargetPlexAnchorDetails) ? "false" : "true" );
    },
    onCommand: function () {
        var plexDetailsId = plexVlc.getPlexDetailsId( gContextMenu ? gContextMenu.target : null ),
            isPortPlex = content.location.port === plexVlc.plexPort;
        console.log( "OnCommand", plexDetailsId );

        if ( !isPortPlex ) {
            console.error( "OnCommand: Not on Plex web", plexVlc.plexPort, content.location );
            return;
        }

        if ( !plexDetailsId ) {
            console.error( "OnCommand: Could not retrieve Plex details id", gContextMenu, content.location.href );
            return;
        }

        plexVlc.doRetrievePlexDetails( plexDetailsId, function ( plexVideoPath, plexVideoStartAt ) {
            console.log( "PlexVideoPath", plexVideoPath, plexVideoStartAt );
            plexVlc.doPlayVideo( plexVideoPath, plexVideoStartAt );
        } );
    },
    doPlayVideo: function ( videoPath, startAt ) {
        plexVlc.vlcProcess = Components.classes["@mozilla.org/process/util;1"].createInstance( Components.interfaces.nsIProcess );

        if ( !videoPath ) {
            console.error( "DoPlayVideo: Video path is empty" );
            plexVlc.doShowToast( "Could not find video to play", true );
            return;
        }

        try {
            plexVlc.videoFile.initWithPath( videoPath );
            try {
                plexVlc.vlcFile.initWithPath( plexVlc.vlcLocation );

                if ( plexVlc.vlcFile.exists() && plexVlc.vlcFile.isExecutable() && plexVlc.vlcFile.isFile() && plexVlc.videoFile.exists() && plexVlc.videoFile.isFile() ) {
                    plexVlc.vlcProcess.init( plexVlc.vlcFile );

                    try {
                        var arguments = [];
                        if ( startAt ) {
                            arguments.push( "--start-time=" + (startAt / 1000) );
                        }
                        arguments.push( videoPath );
                        console.log( "DoPlayVideo: Running VLC process with arguments", arguments.join( " " ) );
                        plexVlc.vlcProcess.run( false, arguments, arguments.length );
                        plexVlc.doShowToast( "Playing video in VLC" );
                    } catch ( NS_ERROR_FILE_TARGET_DOES_NOT_EXIST ) {
                        console.error( "DoPlayVideo: VLC file does not exist" );
                        plexVlc.doShowToast( "Could not run play video with VLC", true );
                    }
                }
                else if ( !plexVlc.vlcFile.exists() ) {
                    console.error( "DoPlayVideo: VLC executable does not exist", plexVlc.vlcLocation );
                }
                else if ( !plexVlc.vlcFile.isExecutable() ) {
                    console.error( "DoPlayVideo: VLC executable is not a executable", plexVlc.vlcLocation );
                }
                else if ( !plexVlc.vlcFile.isFile() ) {
                    console.error( "DoPlayVideo: VLC executable is not a file", plexVlc.vlcLocation );
                }
                else if ( !plexVlc.videoFile.exists() ) {
                    console.error( "DoPlayVideo: Video does not exist", plexVlc.videoFile );
                }
                else if ( !plexVlc.videoFile.isFile() ) {
                    console.error( "DoPlayVideo: Video does is not a file", plexVlc.videoFile );
                }
                else {
                    console.error( "DoPlayVideo: Could not play video", plexVlc.vlcFile, plexVlc.videoFile );
                }
            } catch ( NS_ERROR_FILE_UNRECOGNIZED_PATH ) {
                console.error( "DoPlayVideo: Could not find VLC executable", plexVlc.vlcLocation );
                plexVlc.doShowToast( "Could not find VLC", true );
                if ( confirm( "Could not find VLC. Press OK to set VLC path." ) ) {
                    plexVlc.doFindVLCPath();
                }
            }
        } catch ( NS_ERROR_FILE_UNRECOGNIZED_PATH ) {
            console.error( "DoPlayVideo: Could not find video file", videoPath );
            plexVlc.doShowToast( "Could not find video file on computer", true );
        }

    },
    doShowToast: function ( message, isError ) {
        console.log( "DoShowToast", message );

        var removeToast = function () {
            console.log( "DoShowToast: Removing toast", plexVlc.toastElement );
            clearTimeout( plexVlc.toastTimeout );

            if ( plexVlc.toastElement && plexVlc.toastElement.parentNode ) {
                plexVlc.toastElement.parentNode.removeChild( plexVlc.toastElement );
            }

            plexVlc.toastElement = null;
            plexVlc.toastTimeout = null;
        }

        removeToast();

        var backgroundColor = isError ? "rgba(255, 0, 0, 0.9)" : "rgba(0, 0, 0, 0.1)",
            color = isError ? "rgb(255, 255, 255)" : "rgb(51, 51, 51)",
            toastHtml = '<div style="position: fixed; z-index: 10000; left: 0px; bottom: 0px; display: table; width: 100%; text-align: center;"><div style="display: table-cell;"><div style="display: inline-block; padding: 4px; margin-bottom: 10px; background-color: ' + backgroundColor + '; font-size: 14px; font-family: Arial,Helvetica,Verdana; color: ' + color + ';">' + message + '</div></div></div>',
            toastElement = content.document.createElement( "div" );

        toastElement.innerHTML = toastHtml;
        plexVlc.toastElement = toastElement.children[0];
        content.document.body.appendChild( plexVlc.toastElement );

        plexVlc.toastTimeout = setTimeout( removeToast, 7000 );
    },
    doFindVLCPath: function () {
        const nsIFilePicker = Components.interfaces.nsIFilePicker;
        const nsILocalFile = Components.interfaces.nsILocalFile;

        var filepicker = Components.classes["@mozilla.org/filepicker;1"].createInstance( nsIFilePicker );
        filepicker.init( window, "Locate VLC executable", nsIFilePicker.modeOpen );
        filepicker.appendFilters( nsIFilePicker.filterApps );
        filepicker.appendFilters( nsIFilePicker.filterAll );

        var ret = filepicker.show();
        console.log( "DoFindVLCPath: Shown", ret );
        if ( ret == nsIFilePicker.returnOK ) {
            var localFile = filepicker.file.QueryInterface( nsILocalFile ),
                filePath = localFile.path,
                file = Components.classes["@mozilla.org/file/local;1"].createInstance( Components.interfaces.nsILocalFile );

            if ( localFile.leafName.toLowerCase() === "vlc.app" ) {
                filePath = localFile.path + "/Contents/MacOS/VLC";
            }

            console.log( "DoFindVLC: LocalFile", localFile, filePath );

            try {
                file.initWithPath( filePath );

                if ( file.isExecutable() && file.isFile() ) {
                    console.log( "DoFindVLCPath: File is executable and file", file );
                    plexVlc.preferences.setComplexValue( "vlc_location", nsILocalFile, file );
                    plexVlc.vlcLocation = plexVlc.preferences.getCharPref( "vlc_location" );
                    console.log( "DoFindVLCPath: Set pref location", plexVlc.vlcLocation );
                }
                else {
                    console.log( "DoFindVLCPath: Not executable or file", file );
                    alert( "Not a VLC executable" );
                }
            } catch ( NS_ERROR_FILE_UNRECOGNIZED_PATH ) {
                console.error( "DoFindVLCPath: Could not find VLC executable", file );
                alert( "Unrecognized path" );
            }

        }
    },
    doRetrievePlexDetails: function ( detailsId, callback ) {
        var xmlhttp = new XMLHttpRequest(),
            location = content.location,
            plexDetailsUrl = "http://%host%/library/metadata/%id%?checkFiles=1"
                .replace( "%host%", location.host )
                .replace( "%id%", detailsId );
        console.log( "RetrievePlexDetails", plexDetailsUrl );

        xmlhttp.onreadystatechange = function () {
            if ( xmlhttp.readyState == 4 && xmlhttp.status == 200 ) {
                console.log( "RetrievePlexDetails", xmlhttp.readyState, xmlhttp.status, typeof xmlhttp.responseText, xmlhttp.responseText.match );
                var plexVideoDetails = plexVlc.getPlexVideoDetails( xmlhttp.responseText );
                if ( plexVideoDetails ) {
                    callback( plexVideoDetails.path, plexVideoDetails.startAt );
                }
                else {
                    console.error( "RetrievePlexDetails: Could not get video details" );
                }
            }
            else if ( xmlhttp.readyState == 4 ) {
                // TODO Handle error
                console.error( "RetrievePlexDetails: Status: %s", xmlhttp.status );
            }
        }
        xmlhttp.open( "GET", plexDetailsUrl, true );
        xmlhttp.send();
    },
    isPlexDetailsAnchor: function ( target ) {
        var element = target;
        do {
            if ( !element ) {
                return false;
            }
            else if ( element.localName === "a" && plexVlc.plexDetailsUrlRegex.test( element.href ) ) {
                return true;
            }
            element = element.parentNode;
        } while ( element );
        return false;
    },
    getPlexDetailsId: function ( target ) {
        var element = target,
            location = content.location.href;

        do {
            if ( element ) {
                if ( element.localName === "a" && plexVlc.plexDetailsUrlRegex.test( element.href ) ) {
                    return element.href.match( plexVlc.plexDetailsUrlRegex )[1];
                }
                element = element.parentNode;
            }
        } while ( element );

        if ( plexVlc.plexDetailsUrlRegex.test( location ) ) {
            return location.match( plexVlc.plexDetailsUrlRegex )[1];
        }

        return null;
    },
    getPlexVideoDetails: function ( plexDetails ) {
        var plexDetailsTrimmed = plexDetails.replace( /\r?\n|\r/g, "" ),
            plexVideoPathRegex = /<MediaContainer.*?<Video.*<Part.*?file="(.*?)"/m,
            plexVideoStartAtRegex = /<MediaContainer.*?<Video.*viewOffset="(.*?)"/m;

        return {
            path: (plexDetailsTrimmed.match( plexVideoPathRegex ) || [, null])[1],
            startAt: parseInt( (plexDetailsTrimmed.match( plexVideoStartAtRegex ) || [, 0])[1] )
        }
    }
}
window.addEventListener( "load", plexVlc.init, false );
